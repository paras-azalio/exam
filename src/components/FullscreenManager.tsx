import React, { useEffect, useRef, useState } from 'react';

interface FullscreenManagerProps {
  examActive: boolean;
  onViolation: () => void;
  children: React.ReactNode;
}

export const FullscreenManager: React.FC<FullscreenManagerProps> = ({
  examActive,
  onViolation,
  children,
}) => {
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const [violationMsg, setViolationMsg] = useState('');
  const devtoolsCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Debounce: ignore a second violation fired within 1 s of the first
  // (blur + visibilitychange can both fire for the same alt-tab)
  const lastViolationAt = useRef<number>(0);

  const goFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      setFullscreenLost(false);
      setViolationMsg('');
    } catch {
      // fullscreen denied — still clear the overlay so the student can continue
      setFullscreenLost(false);
      setViolationMsg('');
    }
  };

  const registerViolation = (msg: string) => {
    const now = Date.now();
    if (now - lastViolationAt.current < 1000) return; // deduplicate
    lastViolationAt.current = now;
    setViolationMsg(msg);
    setFullscreenLost(true);
    onViolation();
  };

  useEffect(() => {
    if (examActive) {
      goFullscreen();
    } else {
      if (document.fullscreenElement) document.exitFullscreen();
    }
  }, [examActive]);

  useEffect(() => {
    if (!examActive) return;

    // ── window blur: catches Alt+Tab, three-finger app switch, clicking outside ──
    const handleBlur = () => {
      registerViolation('Window focus lost — do not leave the exam window.');
    };

    // ── visibilitychange: catches tab switching within the browser ───────────
    const handleVisibility = () => {
      if (document.hidden) {
        registerViolation('Tab switch detected — do not leave the exam tab.');
      }
    };

    // ── fullscreen exit ──────────────────────────────────────────────────────
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        registerViolation('Fullscreen exited! Click below to return.');
      }
    };

    // ── right-click blocked ──────────────────────────────────────────────────
    const handleContext = (e: MouseEvent) => e.preventDefault();

    // ── keyboard: block devtools combos and refresh ──────────────────────────
    const handleKeys = (e: KeyboardEvent) => {
      const isDevtools =
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
        (e.ctrlKey && ['u', 'U'].includes(e.key));

      if (isDevtools) {
        e.preventDefault();
        registerViolation('Developer tools are not allowed during the exam.');
        return;
      }

      if (e.key === 'F5' || (e.ctrlKey && ['r', 'R'].includes(e.key))) {
        e.preventDefault();
      }
    };

    // ── devtools size heuristic (docked devtools) ────────────────────────────
    devtoolsCheckRef.current = setInterval(() => {
      if (
        window.outerWidth - window.innerWidth > 200 ||
        window.outerHeight - window.innerHeight > 200
      ) {
        registerViolation('Developer tools are not allowed during the exam.');
      }
    }, 2000);

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', handleContext);
    document.addEventListener('keydown', handleKeys);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('contextmenu', handleContext);
      document.removeEventListener('keydown', handleKeys);
      if (devtoolsCheckRef.current) clearInterval(devtoolsCheckRef.current);
    };
  }, [examActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {children}
      {examActive && fullscreenLost && violationMsg && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 text-red-600 mx-auto" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Violation Detected!</h3>
            <p className="text-gray-600 mb-6">{violationMsg}</p>
            <button onClick={goFullscreen}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition">
              Return to Fullscreen
            </button>
          </div>
        </div>
      )}
    </>
  );
};
