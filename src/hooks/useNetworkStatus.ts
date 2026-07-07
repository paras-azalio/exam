/**
 * Live in-exam connection indicator.
 *
 * Pings the backend health endpoint on an interval and classifies the current
 * connection quality by round-trip latency:
 *   - online : responded in < 500 ms
 *   - slow   : responded in 500–2000 ms
 *   - offline: responded in > 2000 ms, timed out, or the request failed
 *
 * Also listens to the browser's native online/offline events for instant
 * feedback when the network drops or returns.
 */
import { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config';

export type NetworkQuality = 'online' | 'slow' | 'offline';

export interface NetworkStatus {
  quality: NetworkQuality;
  latencyMs: number | null;
}

const HEALTH_URL      = `${BACKEND_URL}/api/health`;
const PING_INTERVAL_MS = 10_000;
const PING_TIMEOUT_MS  = 5_000;
const SLOW_THRESHOLD_MS    = 500;
const OFFLINE_THRESHOLD_MS = 2_000;

function classify(latencyMs: number): NetworkQuality {
  if (latencyMs > OFFLINE_THRESHOLD_MS) return 'offline';
  if (latencyMs > SLOW_THRESHOLD_MS) return 'slow';
  return 'online';
}

/**
 * @param enabled  when false, no pings are scheduled (e.g. before the exam is active).
 */
export function useNetworkStatus(enabled = true): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({ quality: 'online', latencyMs: null });
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const ping = async () => {
      if (inFlightRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancelled) setStatus({ quality: 'offline', latencyMs: null });
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
        const latencyMs = performance.now() - start;
        if (!cancelled) {
          setStatus(res.ok
            ? { quality: classify(latencyMs), latencyMs }
            : { quality: 'offline', latencyMs: null });
        }
      } catch {
        if (!cancelled) setStatus({ quality: 'offline', latencyMs: null });
      } finally {
        clearTimeout(timer);
        inFlightRef.current = false;
      }
    };

    // Instant updates from the browser's own connectivity signal.
    const handleOffline = () => { if (!cancelled) setStatus({ quality: 'offline', latencyMs: null }); };
    const handleOnline  = () => { ping(); };

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
