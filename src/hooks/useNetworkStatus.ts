/**
 * Live in-exam connection indicator.
 *
 * Pings the backend health endpoint on a short interval, measures the
 * round-trip, and classifies connection quality. Designed to be *trustworthy*
 * during a live exam — i.e. it must not cry "Slow" on a single latency spike,
 * and it must clearly distinguish "reachable but laggy" from "actually down".
 *
 * Classification (per successful ping):
 *   - online : round-trip ≤ ONLINE_MAX_MS
 *   - slow   : ONLINE_MAX_MS < round-trip ≤ SLOW_MAX_MS
 *   - offline: request failed / timed out, round-trip > SLOW_MAX_MS, or the
 *              browser reports itself offline
 *
 * Why the thresholds are generous: the exam backend is remote, so a healthy
 * baseline round-trip is already a few hundred ms — and camera/screen recording
 * uploads compete for bandwidth during the exam. A tight ceiling (e.g. 500 ms)
 * produces constant false "Slow" warnings. An exam is mostly text + periodic
 * saves, so sub-second latency is perfectly usable and is reported as "online".
 *
 * Stability: the badge only downgrades from "online" after REQUIRED_BAD_SAMPLES
 * consecutive bad readings (a lone spike is ignored), and recovers to "online"
 * on the very next good reading. A hard offline (browser 'offline' event) is
 * reflected instantly.
 */
import { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config';

export type NetworkQuality = 'online' | 'slow' | 'offline';

export interface NetworkStatus {
  quality: NetworkQuality;
  /** Last measured round-trip in ms (null when the last probe failed). */
  latencyMs: number | null;
}

const HEALTH_URL       = `${BACKEND_URL}/api/health`;
const PING_INTERVAL_MS = 5_000;
const PING_TIMEOUT_MS   = 4_000;
/** Round-trip at/under this reads as a healthy "online" connection. */
const ONLINE_MAX_MS = 1_200;
/** Between ONLINE_MAX and this reads as "slow"; above this is treated as offline. */
const SLOW_MAX_MS = 3_000;
/** Consecutive bad readings required before leaving "online" (spike immunity). */
const REQUIRED_BAD_SAMPLES = 2;

/** Classify a single probe. `null` latency means the probe failed / timed out. */
function classifySample(latencyMs: number | null): NetworkQuality {
  if (latencyMs === null) return 'offline';
  if (latencyMs > SLOW_MAX_MS) return 'offline';
  if (latencyMs > ONLINE_MAX_MS) return 'slow';
  return 'online';
}

/**
 * @param enabled  when false, no pings are scheduled (e.g. before the exam is active).
 */
export function useNetworkStatus(enabled = true): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({ quality: 'online', latencyMs: null });
  const inFlightRef  = useRef(false);
  const badStreakRef = useRef(0);
  const lastLatencyRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Fold a fresh sample into the badge state, applying spike-immunity hysteresis.
    const apply = (sampleLatency: number | null) => {
      if (cancelled) return;
      if (sampleLatency !== null) lastLatencyRef.current = sampleLatency;
      const quality = classifySample(sampleLatency);

      if (quality === 'online') {
        badStreakRef.current = 0;
        setStatus({ quality: 'online', latencyMs: sampleLatency });
        return;
      }

      badStreakRef.current += 1;
      if (badStreakRef.current >= REQUIRED_BAD_SAMPLES) {
        // Confirmed degraded connection.
        setStatus({ quality, latencyMs: sampleLatency });
      } else {
        // First bad reading — likely a transient spike. Stay "online" but keep
        // showing the latest latency so the number stays live.
        setStatus(prev =>
          prev.quality === 'online'
            ? { quality: 'online', latencyMs: sampleLatency ?? lastLatencyRef.current }
            : prev,
        );
      }
    };

    const ping = async () => {
      if (inFlightRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        badStreakRef.current = REQUIRED_BAD_SAMPLES;
        apply(null);
        return;
      }
      inFlightRef.current = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      const start = performance.now();
      try {
        const res = await fetch(`${HEALTH_URL}?t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        apply(res.ok ? performance.now() - start : null);
      } catch {
        apply(null);
      } finally {
        clearTimeout(timer);
        inFlightRef.current = false;
      }
    };

    // Instant reaction to the browser's own connectivity signal.
    const handleOffline = () => { badStreakRef.current = REQUIRED_BAD_SAMPLES; apply(null); };
    const handleOnline  = () => { badStreakRef.current = 0; ping(); };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    ping(); // immediate first check
    const interval = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled]);

  return status;
}

export default useNetworkStatus;
