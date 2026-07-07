/**
 * Pre-exam connectivity / bandwidth probe.
 *
 * `runSpeedTest()` measures median latency and (best-effort) download + upload
 * throughput against the backend's lightweight probe endpoints, then decides
 * whether the connection is good enough to start an exam.
 *
 * Backend endpoints (see SpeedTestController.java), all under BACKEND_URL:
 *   GET  /api/health              → latency probe (empty 200)
 *   GET  /api/speedtest/download  → ~2MB random payload (download speed)
 *   POST /api/speedtest/upload    → drains body, returns 200 (upload speed)
 *
 * Verdict (reachability + latency only):
 *   The pass/fail decision is based ONLY on whether the server is reachable and
 *   the median latency is acceptable. Throughput (down/up Mbps) is measured and
 *   reported for the candidate's information, but it does NOT gate "Start Exam".
 *   This avoids false-blocking legitimate candidates on modest connections,
 *   since a small single-connection HTTP probe systematically under-measures
 *   bandwidth on fast links (fixed per-request overhead dominates a short
 *   transfer). If the throughput endpoints are unreachable the test still
 *   returns a latency-only verdict.
 *
 * Throughput measurement (accuracy):
 *   - Download is timed from FIRST byte to LAST byte via a streaming reader, so
 *     connection setup + request round-trip (TTFB) are excluded from the rate.
 *   - Upload subtracts one measured round-trip (median latency) from the total,
 *     since the client can't observe upload-complete separately from the
 *     response round-trip.
 *   These corrections make the displayed numbers much closer to reality than
 *   naively timing the whole fetch (which folds latency into the rate).
 */
import { BACKEND_URL } from '../config';

export const SPEED_THRESHOLDS = {
  /** Minimum acceptable download throughput, in Mbps. */
  downloadMbps: 1,
  /** Minimum acceptable upload throughput, in Mbps. */
  uploadMbps: 0.5,
  /** Maximum acceptable median round-trip latency, in ms. */
  latencyMs: 3000,
} as const;

export interface SpeedTestResult {
  /** Overall verdict — true when the connection is good enough to start. */
  ok: boolean;
  /** True when the browser reports itself offline (navigator.onLine === false). */
  offline: boolean;
  /** Median round-trip latency in ms, or null if unmeasurable. */
  latencyMs: number | null;
  /** Measured download throughput in Mbps, or null if not measured. */
  downloadMbps: number | null;
  /** Measured upload throughput in Mbps, or null if not measured. */
  uploadMbps: number | null;
  /** False when throughput endpoints were unreachable and we fell back to latency-only. */
  throughputTested: boolean;
  /** Human-readable reason when ok === false. */
  reason?: string;
}

const HEALTH_URL   = `${BACKEND_URL}/api/health`;
const DOWNLOAD_URL  = `${BACKEND_URL}/api/speedtest/download`;
const UPLOAD_URL    = `${BACKEND_URL}/api/speedtest/upload`;

const LATENCY_SAMPLES     = 5;
const DOWNLOAD_BYTES      = 2 * 1024 * 1024; // ~2 MB
const UPLOAD_BYTES        = 512 * 1024;      // ~0.5 MB
const PROBE_TIMEOUT_MS    = 10_000;
/** Download can stream for longer on slow links — give the body read its own budget. */
const DOWNLOAD_TIMEOUT_MS = 15_000;
/** Below this, the first-byte→last-byte window is too short to time reliably at chunk resolution. */
const MIN_STREAM_SECONDS  = 0.01;

/** fetch() with an AbortController-based timeout. Throws on timeout or network error. */
async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = PROBE_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Ping /api/health a few times and return the median round-trip in ms (null if all fail). */
async function measureLatency(): Promise<number | null> {
  const samples: number[] = [];
  for (let i = 0; i < LATENCY_SAMPLES; i++) {
    const start = performance.now();
    try {
      const res = await timedFetch(`${HEALTH_URL}?t=${Date.now()}_${i}`, { method: 'GET' }, 5_000);
      if (res.ok) samples.push(performance.now() - start);
    } catch {
      /* timeout / network error — skip this sample */
    }
  }
  return median(samples);
}

/**
 * Download the probe payload and compute throughput in Mbps.
 *
 * Timed from FIRST byte to LAST byte via a streaming reader so connection setup
 * and the request round-trip (TTFB) are excluded from the rate. Falls back to
 * RTT-adjusted whole-body timing when streaming is unavailable or the transfer
 * finishes too fast to time at chunk resolution. Returns null if unreachable.
 *
 * @param latencyMs median round-trip latency, used only for the fallback path.
 */
async function measureDownload(latencyMs: number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const requestStart = performance.now();
    const res = await fetch(`${DOWNLOAD_URL}?bytes=${DOWNLOAD_BYTES}&t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;

    // Preferred path: stream the body and time first-byte → last-byte.
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      let received = 0;
      let firstByte: number | null = null;
      let lastByte = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = performance.now();
        if (firstByte === null) firstByte = now;
        lastByte = now;
        received += value.length;
      }
      if (received === 0) return null;

      const streamSeconds = firstByte !== null ? (lastByte - firstByte) / 1000 : 0;
      if (streamSeconds >= MIN_STREAM_SECONDS) {
        return (received * 8) / (streamSeconds * 1_000_000);
      }
      // Arrived in effectively one burst — fall back to RTT-adjusted total time.
      const totalSeconds = (performance.now() - requestStart) / 1000 - latencyMs / 1000;
      return totalSeconds > 0 ? (received * 8) / (totalSeconds * 1_000_000) : null;
    }

    // Fallback: no streaming support — time the whole body, minus one round-trip.
    const blob = await res.blob();
    const totalSeconds = (performance.now() - requestStart) / 1000 - latencyMs / 1000;
    if (totalSeconds <= 0) return null;
    return (blob.size * 8) / (totalSeconds * 1_000_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upload a payload and compute throughput in Mbps.
 *
 * The client can't observe upload-complete separately from the response
 * round-trip, so we subtract one measured round-trip (median latency) from the
 * total to approximate the pure upload time. Returns null if unreachable.
 *
 * @param latencyMs median round-trip latency, subtracted from the total.
 */
async function measureUpload(latencyMs: number): Promise<number | null> {
  try {
    const payload = new Blob([new Uint8Array(UPLOAD_BYTES)]);
    const start = performance.now();
    const res = await timedFetch(UPLOAD_URL, { method: 'POST', body: payload });
    if (!res.ok) return null;
    const totalSeconds = (performance.now() - start) / 1000 - latencyMs / 1000;
    if (totalSeconds <= 0) return null;
    return (UPLOAD_BYTES * 8) / (totalSeconds * 1_000_000);
  } catch {
    return null;
  }
}

/**
 * Run the full connection check. Resolves with a verdict; never rejects.
 */
export async function runSpeedTest(): Promise<SpeedTestResult> {
  // Fast-fail if the browser itself knows it's offline.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      offline: true,
      latencyMs: null,
      downloadMbps: null,
      uploadMbps: null,
      throughputTested: false,
      reason: 'Your device is offline. Connect to the internet and retry.',
    };
  }

  const latencyMs = await measureLatency();

  // No latency sample at all → backend unreachable / no connection.
  if (latencyMs === null) {
    return {
      ok: false,
      offline: true,
      latencyMs: null,
      downloadMbps: null,
      uploadMbps: null,
      throughputTested: false,
      reason: 'Could not reach the exam server. Check your connection and retry.',
    };
  }

  // Latency decides reachability quality — evaluated before throughput.
  if (latencyMs > SPEED_THRESHOLDS.latencyMs) {
    return {
      ok: false,
      offline: false,
      latencyMs,
      downloadMbps: null,
      uploadMbps: null,
      throughputTested: false,
      reason: `High latency (${Math.round(latencyMs)} ms). A more stable connection is required.`,
    };
  }

  // Throughput is measured for the candidate's information only — it does NOT
  // gate the verdict (a small single-connection probe under-measures fast links,
  // and a hard throughput gate risks false-blocking legitimate candidates).
  const [downloadMbps, uploadMbps] = await Promise.all([
    measureDownload(latencyMs),
    measureUpload(latencyMs),
  ]);
  const throughputTested = downloadMbps !== null && uploadMbps !== null;

  // Reachable + acceptable latency → pass, regardless of measured throughput.
  return {
    ok: true,
    offline: false,
    latencyMs,
    downloadMbps,
    uploadMbps,
    throughputTested,
  };
}
