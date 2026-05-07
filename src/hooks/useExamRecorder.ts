import { useRef, useCallback, useState } from 'react';

const API_BASE = 'http://localhost:8080';

/**
 * How long each recording segment lasts before the recorder is cycled.
 * Every cycle produces ONE independently-playable .webm file.
 *
 * ─── Change this to control segment length ───────────────────────────────
 *  10_000  →  10-second chunks  (many small files, smallest gap risk)
 *  30_000  →  30-second chunks  (fewer files, easier to review)
 *  60_000  →  1-minute chunks
 * ─────────────────────────────────────────────────────────────────────────
 */
const CYCLE_MS = 30_000;

// ─── helpers ──────────────────────────────────────────────────────────────────

const getSupportedMimeType = (forScreen = false): string => {
  const types = forScreen
    ? ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm']
    : ['video/webm; codecs=vp9,opus', 'video/webm; codecs=vp8,opus', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
};

const uploadChunk = async (
  blob: Blob,
  sessionKey: string,
  source: string,
  chunkIndex: number
): Promise<void> => {
  const formData = new FormData();
  formData.append(
    'file',
    blob,
    `${source}_chunk_${String(chunkIndex).padStart(4, '0')}.webm`
  );
  formData.append('sessionKey', sessionKey);
  formData.append('source', source);
  formData.append('chunkIndex', String(chunkIndex));
  try {
    await fetch(`${API_BASE}/api/media/chunk`, { method: 'POST', body: formData });
  } catch (err) {
    console.error('Chunk upload failed:', err);
  }
};

/**
 * Creates a brand-new MediaRecorder on the given stream and starts it
 * WITHOUT a timeslice (i.e., it accumulates data until stop() is called).
 *
 * WHY no timeslice?
 *   recorder.start(N)  — timeslice mode — emits raw WebM clusters every N ms.
 *   Only the very first emission includes the EBML/WebM container header that
 *   media players need. Every subsequent chunk is headerless and cannot be
 *   opened independently.
 *
 *   recorder.start()   — no timeslice — the recorder buffers everything until
 *   stop() is called, at which point it emits ONE complete, self-contained
 *   WebM blob (header + all clusters). By stopping and creating a *new*
 *   MediaRecorder on the same stream every CYCLE_MS seconds, every saved
 *   file starts with a fresh header and is independently playable.
 */
const spawnRecorder = (
  stream: MediaStream,
  mimeType: string,
  source: 'camera' | 'screen',
  sessionKey: string,
  chunkIdx: { current: number }
): MediaRecorder => {
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  rec.ondataavailable = async (e) => {
    if (e.data.size > 0) {
      // chunkIdx.current read + increment at fire time (single-threaded JS, safe)
      await uploadChunk(e.data, sessionKey, source, chunkIdx.current++);
    }
  };
  rec.start(); // no timeslice
  return rec;
};

// ─── hook ─────────────────────────────────────────────────────────────────────

export type ScreenShareStatus = 'idle' | 'sharing' | 'stopped';

export const useExamRecorder = (sessionKey: string | null) => {
  // Active recorder instances (replaced on each cycle)
  const cameraRecorder = useRef<MediaRecorder | null>(null);
  const screenRecorder = useRef<MediaRecorder | null>(null);

  // Underlying media streams (kept alive across cycles)
  const cameraStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);

  // Running chunk counters (never reset mid-session so indices are always unique)
  const cameraChunk = useRef(0);
  const screenChunk = useRef(0);

  // Cycle interval handles
  const cameraCycleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenCycleTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [screenStatus, setScreenStatus] = useState<ScreenShareStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  // ── camera ──────────────────────────────────────────────────────────────────

  const startCameraRecording = useCallback(async (): Promise<boolean> => {
    if (!sessionKey) return false;

    // Tear down any previous camera session
    if (cameraCycleTimer.current) clearInterval(cameraCycleTimer.current);
    if (cameraRecorder.current?.state === 'recording') cameraRecorder.current.stop();
    cameraStream.current?.getTracks().forEach((t) => t.stop());
    cameraChunk.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraStream.current = stream;
      const mimeType = getSupportedMimeType(false);

      // Spawn the first segment recorder
      cameraRecorder.current = spawnRecorder(stream, mimeType, 'camera', sessionKey, cameraChunk);

      // Every CYCLE_MS: stop current recorder (→ ondataavailable → upload complete WebM)
      // then spawn a new recorder (→ fresh EBML header → next file is also independently playable)
      cameraCycleTimer.current = setInterval(() => {
        if (cameraRecorder.current?.state === 'recording') {
          cameraRecorder.current.stop();
          cameraRecorder.current = spawnRecorder(
            stream,
            mimeType,
            'camera',
            sessionKey,
            cameraChunk
          );
        }
      }, CYCLE_MS);

      setCameraError(null);
      return true;
    } catch (err: any) {
      setCameraError(err?.message ?? 'Camera access denied');
      return false;
    }
  }, [sessionKey]);

  // ── screen ──────────────────────────────────────────────────────────────────

  const startScreenRecording = useCallback(async (): Promise<boolean> => {
    if (!sessionKey) return false;

    // Tear down any previous screen session
    if (screenCycleTimer.current) clearInterval(screenCycleTimer.current);
    if (screenRecorder.current?.state === 'recording') screenRecorder.current.stop();
    screenStream.current?.getTracks().forEach((t) => t.stop());
    screenChunk.current = 0;

    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
      });

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings() as any;

      if (settings.displaySurface && settings.displaySurface !== 'monitor') {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        setScreenError('Please share your entire screen, not a window or browser tab.');
        return false;
      }

      screenStream.current = stream;
      setScreenStatus('sharing');
      setScreenError(null);

      const mimeType = getSupportedMimeType(true);

      // Spawn the first segment recorder
      screenRecorder.current = spawnRecorder(stream, mimeType, 'screen', sessionKey, screenChunk);

      // Cycle timer — same logic as camera
      screenCycleTimer.current = setInterval(() => {
        if (screenRecorder.current?.state === 'recording') {
          screenRecorder.current.stop();
          screenRecorder.current = spawnRecorder(
            stream,
            mimeType,
            'screen',
            sessionKey,
            screenChunk
          );
        }
      }, CYCLE_MS);

      // User stopped sharing via the browser's native UI
      track.addEventListener('ended', () => {
        setScreenStatus('stopped');
        if (screenCycleTimer.current) {
          clearInterval(screenCycleTimer.current);
          screenCycleTimer.current = null;
        }
        if (screenRecorder.current?.state === 'recording') {
          screenRecorder.current.stop();
        }
        screenStream.current = null;
      });

      return true;
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        setScreenError(err?.message ?? 'Screen share failed');
      }
      return false;
    }
  }, [sessionKey]);

  // ── stop all ─────────────────────────────────────────────────────────────────

  const stopAllRecording = useCallback(() => {
    if (cameraCycleTimer.current) {
      clearInterval(cameraCycleTimer.current);
      cameraCycleTimer.current = null;
    }
    if (screenCycleTimer.current) {
      clearInterval(screenCycleTimer.current);
      screenCycleTimer.current = null;
    }
    if (cameraRecorder.current?.state === 'recording') cameraRecorder.current.stop();
    if (screenRecorder.current?.state === 'recording') screenRecorder.current.stop();
    cameraStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current?.getTracks().forEach((t) => t.stop());
    cameraStream.current = null;
    screenStream.current = null;
  }, []);

  return {
    startCameraRecording,
    startScreenRecording,
    stopAllRecording,
    screenStatus,
    cameraError,
    screenError,
    setCameraError,
    setScreenError,
  };
};
