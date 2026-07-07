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
 * If the throughput endpoints are unreachable (e.g. not yet deployed) the test
 * gracefully falls back to a latency-only verdict rather than failing outright.
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

/** Download the probe payload and compute throughput in Mbps. Null if the endpoint is unreachable. */
async function measureDownload(): Promise<number | null> {
  try {
    const start = performance.now();
    const res = await timedFetch(`${DOWNLOAD_URL}?bytes=${DOWNLOAD_BYTES}&t=${Date.now()}`, { method: 'GET' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const seconds = (performance.now() - start) / 1000;
    if (seconds <= 0) return null;
    return (blob.size * 8) / (seconds * 1_000_000);
  } catch {
    return null;
  }
}

/** Upload a payload and compute throughput in Mbps. Null if the endpoint is unreachable. */
async function measureUpload(): Promise<number | null> {
  try {
    const payload = new Blob([new Uint8Array(UPLOAD_BYTES)]);
    const start = performance.now();
    const res = await timedFetch(UPLOAD_URL, { method: 'POST', body: payload });
    if (!res.ok) return null;
    const seconds = (performance.now() - start) / 1000;
    if (seconds <= 0) return null;
    return (UPLOAD_BYTES * 8) / (seconds * 1_000_000);
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

  const [downloadMbps, uploadMbps] = await Promise.all([measureDownload(), measureUpload()]);
  const throughputTested = downloadMbps !== null && uploadMbps !== null;

  // Latency is always evaluated.
  if (latencyMs > SPEED_THRESHOLDS.latencyMs) {
    return {
      ok: false,
      offline: false,
      latencyMs,
      downloadMbps,
      uploadMbps,
      throughputTested,
      reason: `High latency (${Math.round(latencyMs)} ms). A more stable connection is required.`,
    };
  }

  // Throughput endpoints unreachable → latency-only pass.
  if (!throughputTested) {
    return {
      ok: true,
      offline: false,
      latencyMs,
      downloadMbps,
      uploadMbps,
      throughputTested: false,
    };
  }

  if (downloadMbps! < SPEED_THRESHOLDS.downloadMbps) {
    return {
      ok: false,
      offline: false,
      latencyMs,
      downloadMbps,
      uploadMbps,
      throughputTested,
      reason: `Download speed too low (${downloadMbps!.toFixed(2)} Mbps). At least ${SPEED_THRESHOLDS.downloadMbps} Mbps is required.`,
    };
  }

  if (uploadMbps! < SPEED_THRESHOLDS.uploadMbps) {
    return {
      ok: false,
      offline: false,
      latencyMs,
      downloadMbps,
      uploadMbps,
      throughputTested,
      reason: `Upload speed too low (${uploadMbps!.toFixed(2)} Mbps). At least ${SPEED_THRESHOLDS.uploadMbps} Mbps is required.`,
    };
  }

  return {
    ok: true,
    offline: false,
    latencyMs,
    downloadMbps,
    uploadMbps,
    throughputTested,
  };
}
