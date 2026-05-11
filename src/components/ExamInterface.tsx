import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExamData, Answer, QuestionStatus, Section } from '../types/exam';
import { QuestionDisplay } from './QuestionDisplay';
import { QuestionNavigator } from './QuestionNavigator';
import { JobDescriptionPage } from './JobDescriptionPage';
import { formatTime } from '../utils/examUtils';
import { useExamRecorder } from '../hooks/useExamRecorder';

interface ExamInterfaceProps {
  examData: ExamData;
  studentName: string;
  studentEmail?: string;
  sessionKey: string;
  isJwtMode?: boolean;
  onSubmit: (answers: Answer[], questionOrderMap: Record<string, number>) => void;
  onSuppressViolations: (ms: number) => void;
  onPhaseActive: () => void;
  onViolation?: () => void;
  violations: number;
}

// Fisher-Yates shuffle
const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const ExamInterface: React.FC<ExamInterfaceProps> = ({
  examData,
  studentName,
  studentEmail = '',
  sessionKey,
  isJwtMode = false,
  onSubmit,
  onSuppressViolations,
  onPhaseActive,
  onViolation,
  violations,
}) => {
  const recording = examData.recording ?? {};
  const needsRecording = !!(recording.camera || recording.screen);

  // Shuffle questions once on mount per section config, then assign sequential
  // display numbers that match the rendered UI order (not the original JSON order).
  const [activeSections] = useState<Section[]>(() => {
    const shuffled = examData.sections.map((section) => ({
      ...section,
      questions: section.shuffleQuestions
        ? shuffleArray(section.questions)
        : section.questions,
    }));
    let counter = 1;
    return shuffled.map((section) => ({
      ...section,
      questions: section.questions.map((q) => ({ ...q, number: counter++ })),
    }));
  });

  const allQuestions = activeSections.flatMap((section) =>
    section.questions.map((q) => ({
      ...q,
      sectionId: section.sectionId,
      sectionName: section.sectionName,
    }))
  );

  // Stable map from questionId → render-order number; used when scoring so that
  // result details reflect the same numbers the student saw during the exam.
  const questionOrderMapRef = useRef<Record<string, number>>({});
  questionOrderMapRef.current = Object.fromEntries(allQuestions.map((q) => [q.id, q.number]));

  // exam phases: jd (jwt only) → setup → disclaimer → active
  const initialPhase = (): 'jd' | 'setup' | 'disclaimer' | 'active' => {
    if (isJwtMode && examData.jobDescription?.trim()) return 'jd';
    return needsRecording ? 'setup' : 'disclaimer';
  };
  const [examPhase, setExamPhase] = useState<'jd' | 'setup' | 'disclaimer' | 'active'>(initialPhase);
  const [cameraReady, setCameraReady] = useState(!recording.camera);
  const [screenReady, setScreenReady] = useState(!recording.screen);
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questionStatuses, setQuestionStatuses] = useState<QuestionStatus[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(examData.duration);
  const [showNavigator, setShowNavigator] = useState(false);

  // Keep a ref to answers so the timer callback always reads the latest value
  const answersRef = useRef<Answer[]>([]);
  answersRef.current = answers;

  const {
    startCameraRecording,
    startScreenRecording,
    stopAllRecording,
    screenStatus,
    cameraError,
    screenError,
    setCameraError,
    setScreenError,
  } = useExamRecorder(sessionKey);

  // Initialize question statuses
  useEffect(() => {
    setQuestionStatuses(
      allQuestions.map((q) => ({ questionId: q.id, status: 'not-visited' }))
    );
  }, []);

  // Mark current question as visited once exam is active
  const currentQuestion = allQuestions[currentQuestionIndex];
  useEffect(() => {
    if (currentQuestion && examPhase === 'active') {
      setQuestionStatuses((prev) =>
        prev.map((s) =>
          s.questionId === currentQuestion.id && s.status === 'not-visited'
            ? { ...s, status: 'not-answered' }
            : s
        )
      );
    }
  }, [currentQuestionIndex, examPhase]);

  // Stop recording on unmount regardless of how exam ends
  useEffect(() => {
    return () => stopAllRecording();
  }, []);

  // When screen share is stopped by the user (browser native UI):
  // 1. Reset screenReady so the setup phase shows the grant button again.
  // 2. Count it as a violation if the exam is already active.
  useEffect(() => {
    if (screenStatus === 'stopped' && recording.screen) {
      setScreenReady(false);
      if (examPhase === 'active') {
        onViolation?.();
      }
    }
  }, [screenStatus]);

  // Timer — only runs when exam is active
  const doAutoSubmit = useCallback(() => {
    stopAllRecording();
    onSubmit(answersRef.current, questionOrderMapRef.current);
  }, [stopAllRecording, onSubmit]);

  const doAutoSubmitRef = useRef(doAutoSubmit);
  doAutoSubmitRef.current = doAutoSubmit;

  useEffect(() => {
    if (examPhase !== 'active') return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          doAutoSubmitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [examPhase]);

  // --- Setup phase handlers ---
  const handleStartCamera = async () => {
    setCameraError(null);
    const ok = await startCameraRecording();
    if (ok) setCameraReady(true);
  };

  const handleStartScreenShare = async () => {
    setScreenError(null);
    // Suppress violations for 10s while screen picker is open (may briefly exit fullscreen)
    onSuppressViolations(10_000);
    const ok = await startScreenRecording();
    if (ok) setScreenReady(true);
  };

  // "Begin Exam" on setup → go to disclaimer
  const handleBeginExam = () => {
    setExamPhase('disclaimer');
  };

  // "Start Exam" on disclaimer → activate exam (fullscreen already entered at login)
  const handleStartExam = () => {
    setExamPhase('active');
    onPhaseActive();
  };

  // --- Exam phase handlers ---
  const handleAnswerChange = (answer: string | string[]) => {
    setAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === currentQuestion.id);
      if (existing) {
        return prev.map((a) =>
          a.questionId === currentQuestion.id ? { ...a, answer } : a
        );
      }
      return [...prev, { questionId: currentQuestion.id, answer }];
    });
  };

  const handleMarkToggle = () => {
    setAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === currentQuestion.id);
      if (existing) {
        return prev.map((a) =>
          a.questionId === currentQuestion.id
            ? { ...a, isMarked: !a.isMarked }
            : a
        );
      }
      return [...prev, { questionId: currentQuestion.id, answer: '', isMarked: true }];
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < allQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0 && examData.canNavigate) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = () => {
    if (window.confirm('Are you sure you want to submit your exam?')) {
      stopAllRecording();
      onSubmit(answersRef.current, questionOrderMapRef.current);
    }
  };

  const currentAnswer = answers.find((a) => a.questionId === currentQuestion?.id);

  // ── JD Phase UI (JWT invite links only) ────────────────────────────────────
  if (examPhase === 'jd') {
    return (
      <JobDescriptionPage
        examData={examData}
        studentName={studentName}
        studentEmail={studentEmail}
        onNext={() => setExamPhase(needsRecording ? 'setup' : 'disclaimer')}
      />
    );
  }

  // ── Setup Phase UI ──────────────────────────────────────────────────────────
  if (examPhase === 'setup') {
    const allReady = cameraReady && screenReady;

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Recording Setup</h2>
            <p className="text-gray-500 text-sm">
              Complete the setup below, then click <strong>Begin Exam</strong>.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {recording.camera && (
              <div
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition ${
                  cameraReady ? 'border-green-400 bg-green-50' : 'border-gray-200'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                    cameraReady ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800">Camera &amp; Microphone</p>
                  <p className="text-sm text-gray-500 truncate">
                    {cameraReady
                      ? 'Active'
                      : cameraError
                      ? `Error: ${cameraError}`
                      : 'Click Grant to allow access'}
                  </p>
                </div>
                {!cameraReady && (
                  <button
                    onClick={handleStartCamera}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    {cameraError ? 'Retry' : 'Grant'}
                  </button>
                )}
                {cameraReady && (
                  <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            )}

            {recording.screen && (
              <div
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition ${
                  screenReady ? 'border-green-400 bg-green-50' : 'border-gray-200'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                    screenReady ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800">Screen Recording</p>
                  <p className="text-sm text-gray-500 truncate">
                    {screenReady
                      ? 'Sharing entire screen'
                      : screenError
                      ? screenError
                      : 'You must share your entire screen (not a window or tab)'}
                  </p>
                </div>
                {!screenReady && (
                  <button
                    onClick={handleStartScreenShare}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    {screenError ? 'Retry' : 'Share Screen'}
                  </button>
                )}
                {screenReady && (
                  <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleBeginExam}
            disabled={!allReady}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed text-lg"
          >
            Begin Exam
          </button>
          {!allReady && (
            <p className="text-center text-xs text-gray-400 mt-3">
              Complete all recording steps before starting.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Screen-share-stopped blocker (disclaimer + active phases) ──────────────
  // Shown as a full-screen overlay whenever screen recording is required but stopped.
  // Pauses the exam visually and forces the user to re-share before continuing.
  const screenStopped = recording.screen && screenStatus === 'stopped'
    && (examPhase === 'disclaimer' || examPhase === 'active');

  if (screenStopped) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {examPhase === 'active' ? 'Exam Paused' : 'Screen Share Required'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Screen sharing has stopped. You must share your entire screen to
            {examPhase === 'active' ? ' resume the exam.' : ' continue.'}
            {'\n'}Please click the button below and select your entire screen.
          </p>
          {screenError && (
            <p className="text-red-500 text-xs mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {screenError}
            </p>
          )}
          <button
            onClick={handleStartScreenShare}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-sm"
          >
            Share Screen
          </button>
        </div>
      </div>
    );
  }

  // ── Disclaimer Phase UI ─────────────────────────────────────────────────────
  if (examPhase === 'disclaimer') {
    const maxV = examData.maxViolations ?? 3;
    const rules = [
      {
        title: 'Fullscreen Required',
        desc: 'The exam runs in fullscreen. Exiting fullscreen is counted as a violation.',
      },
      {
        title: 'No Tab Switching',
        desc: 'Switching tabs or minimising the browser window counts as a violation.',
      },
      // {
      //   title: 'No Developer Tools',
      //   desc: 'Opening browser developer tools (F12, Ctrl+Shift+I, etc.) is prohibited.',
      // },
      {
        title: 'You can click on hide button next to stop screen share',
        desc: 'Dont click on stop screen sharing as you might get disqualified.',
      },
      {
        title: 'No Right-Click',
        desc: 'Right-clicking is disabled for the duration of the exam.',
      },
      {
        title: 'No Page Refresh',
        desc: 'Refreshing the page (F5 / Ctrl+R) is blocked. It may cause loss of your answers.',
      },
      ...(recording.camera
        ? [{ title: 'Camera & Microphone Recording', desc: 'Your webcam and audio are being recorded throughout the exam.' }]
        : []),
      ...(recording.screen
        ? [{ title: 'Screen Recording', desc: 'Your entire screen is being recorded throughout the exam.' }]
        : []),
      {
        title: `${maxV} Violations = Auto-Submit`,
        desc: `Reaching ${maxV} violations will automatically submit your exam with whatever you have answered so far.`,
      },
    ];

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full max-h-screen overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex-shrink-0 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Exam Rules & Guidelines</h2>
              <p className="text-sm text-gray-500">Read carefully before starting</p>
            </div>
          </div>

          {/* Exam info strip */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-sm text-blue-800">
            <span className="font-semibold">{examData.examTitle}</span>
            <span className="mx-2 text-blue-300">|</span>
            Code: {examData.examCode}
            <span className="mx-2 text-blue-300">|</span>
            Duration: {Math.floor(examData.duration / 60)} min
          </div>

          {/* Rules */}
          <ul className="space-y-3 mb-6">
            {rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 bg-red-100 rounded-full flex-shrink-0 flex items-center justify-center">
                  <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{rule.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{rule.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Acknowledgment */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={disclaimerAgreed}
              onChange={(e) => setDisclaimerAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0"
            />
            <span className="text-sm text-gray-700">
              I have read and understood all the rules above and agree to comply with the proctoring requirements.
            </span>
          </label>

          <button
            onClick={handleStartExam}
            disabled={!disclaimerAgreed}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed text-lg"
          >
            Start Exam
          </button>
        </div>
      </div>
    );
  }

  // ── Active Exam UI ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Watermark */}
      <div
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center"
        style={{
          fontSize: '120px',
          color: 'rgba(0,0,0,0.03)',
          fontWeight: 'bold',
          transform: 'rotate(-45deg)',
          userSelect: 'none',
        }}
      >
        {studentName}
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="bg-white shadow-md border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{examData.examTitle}</h1>
              <p className="text-sm text-gray-600">
                Student: {studentName} | Code: {examData.examCode}
              </p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {/* Recording status */}
              {recording.camera && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      cameraReady ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
                    }`}
                  />
                  {cameraReady ? 'Cam REC' : 'Cam Off'}
                </div>
              )}

              {recording.screen && screenStatus === 'sharing' && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Screen REC
                </div>
              )}

              {/* Timer */}
              <div className="text-right">
                <div
                  className={`text-2xl font-bold ${
                    timeRemaining < 300 ? 'text-red-600' : 'text-gray-800'
                  }`}
                >
                  {formatTime(timeRemaining)}
                </div>
                <div className="text-xs text-gray-500">Time Remaining</div>
              </div>

              {violations > 0 && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-red-600">{violations}</div>
                  <div className="text-xs text-gray-500">Violations</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-4">
            {currentQuestion && (
              <QuestionDisplay
                question={currentQuestion}
                answer={currentAnswer}
                onAnswerChange={handleAnswerChange}
                onMarkToggle={handleMarkToggle}
                sectionName={currentQuestion.sectionName}
              />
            )}

            {/* Prev / Next */}
            <div className="bg-white rounded-lg p-4 flex items-center justify-between">
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0 || !examData.canNavigate}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                Previous
              </button>

              <div className="text-sm text-gray-600">
                Question {currentQuestionIndex + 1} of {allQuestions.length}
              </div>

              <button
                onClick={handleNext}
                disabled={currentQuestionIndex === allQuestions.length - 1}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                {currentQuestionIndex === allQuestions.length - 1 ? 'Last Question' : 'Next'}
              </button>
            </div>

            {/* Submit row */}
            <div className="bg-white rounded-lg p-4 flex items-center justify-between">
              <button
                onClick={() => setShowNavigator(!showNavigator)}
                className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition font-medium lg:hidden"
              >
                {showNavigator ? 'Hide Navigator' : 'Show Navigator'}
              </button>
              <button
                onClick={handleSubmit}
                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-lg ml-auto"
              >
                Submit Exam
              </button>
            </div>
          </div>

          {/* Navigator */}
          <div className={`${showNavigator ? 'block' : 'hidden'} lg:block`}>
            <QuestionNavigator
              examData={examData}
              sections={activeSections}
              currentQuestionIndex={currentQuestionIndex}
              answers={answers}
              questionStatuses={questionStatuses}
              onNavigate={setCurrentQuestionIndex}
              canNavigate={examData.canNavigate}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
