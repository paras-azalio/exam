import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
  stream: MediaStream | null;
  videoActive: boolean;
  audioActive: boolean;
}

/**
 * Small draggable Picture-in-Picture window shown on the candidate's exam screen
 * when the proctor turns on their camera and/or mic. The admin's audio auto-plays
 * (the element is intentionally NOT muted) so the candidate can hear the proctor.
 *
 * Renders nothing while the proctor is sending no media.
 */
export default function FloatingProctorWindow({ stream, videoActive, audioActive }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [pos, setPos] = useState({ x: window.innerWidth - 260, y: 88 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Attach the live admin stream; replay if it changes across renegotiations.
  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      if (stream) videoRef.current.play().catch(() => { /* autoplay may need a gesture */ });
    }
  }, [stream]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const w = 240, h = videoActive ? 200 : 64;
    const x = Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - w);
    const y = Math.min(Math.max(0, e.clientY - dragRef.current.dy), window.innerHeight - h);
    setPos({ x, y });
  }, [videoActive]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  if (!videoActive && !audioActive) return null;

  return (
    <div
      className="fixed z-[9998] w-60 rounded-xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-900 select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 cursor-move text-white"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        </span>
        <span className="text-xs font-semibold">Proctor</span>
        {audioActive && (
          <svg className="w-3.5 h-3.5 ml-auto text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z" />
          </svg>
        )}
      </div>

      {/* Video (kept mounted so audio plays even when video is off) */}
      <div className={`relative bg-black ${videoActive ? 'h-[160px]' : 'h-0'}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${videoActive ? '' : 'hidden'}`}
        />
      </div>

      {/* Audio-only state */}
      {!videoActive && audioActive && (
        <div className="flex items-center gap-2 px-3 py-2 text-slate-200 text-xs">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center">🎙️</div>
          <span>Proctor is speaking…</span>
        </div>
      )}
    </div>
  );
}
