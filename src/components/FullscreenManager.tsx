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

  const goFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreenLost(false);
        setViolationMsg('');
      }
    } catch {
      console.log('Fullscreen request denied');
    }
  };

  const registerViolation = (msg: string) => {
    setViolationMsg(msg);
    setFullscreenLost(true);
    onViolation();
  };

  useEffect(() => {
    if (examActive) {
      goFullscreen();
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  }, [examActive]);

  useEffect(() => {
    if (!examActive) return;

    const handleVisibility = () => {
      if (document.hidden) {
        if (!document.fullscreenElement) {
          registerViolation('You switched tab! Return to fullscreen.');
        } else {
          onViolation();
        }
      }
    };

    const handleContext = (e: MouseEvent) => e.preventDefault();

    const handleKeys = (e: KeyboardEvent) => {
      const devtoolsCombo =
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'));

      if (devtoolsCombo) {
        e.preventDefault();
        registerViolation('Developer tools are not allowed during the exam!');
        return;
      }

      // Block refresh attempts
      if (
        e.key === 'F5' ||
        (e.ctrlKey && (e.key === 'r' || e.key === 'R'))
      ) {
        e.preventDefault();
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && examActive) {
        registerViolation('Fullscreen lost! Click below to return.');
      }
    };

    // Detect devtools open via window size difference (docked devtools)
    devtoolsCheckRef.current = setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > 200 || heightDiff > 200) {
        registerViolation('Developer tools are not allowed during the exam!');
      }
    }, 2000);

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('contextmenu', handleContext);
    document.addEventListener('keydown', handleKeys);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('contextmenu', handleContext);
      document.removeEventListener('keydown', handleKeys);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (devtoolsCheckRef.current) clearInterval(devtoolsCheckRef.current);
    };
  }, [examActive]);

  return (
    <>
      {children}
      {examActive && fullscreenLost && violationMsg && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md text-center">
            <div className="mb-4">
              <svg
                className="w-16 h-16 text-red-600 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Violation Detected!</h3>
            <p className="text-gray-600 mb-6">{violationMsg}</p>
            <button
              onClick={goFullscreen}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              Return to Fullscreen
            </button>
          </div>
        </div>
      )}
    </>
  );
};
