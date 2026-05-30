import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExamData, Answer, QuestionStatus, Section } from '../types/exam';
import { QuestionDisplay } from './QuestionDisplay';
import { QuestionNavigator } from './QuestionNavigator';
import { JobDescriptionPage } from './JobDescriptionPage';
import { formatTime, loadExamQuestions } from '../utils/examUtils';
import { useExamRecorder } from '../hooks/useExamRecorder';
import { BACKEND_URL } from '../config';

interface ExamInterfaceProps {
  examData: ExamData;
  studentName: string;
  studentEmail?: string;
  sessionKey: string;
  /** Raw JWT invite token — used to authenticate the /questions fetch. */
  jwtToken?: string;
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

/** Apply shuffle config and assign sequential display numbers to questions. */
const initializeSections = (sections: Section[]): Section[] => {
  const shuffled = sections.map((section) => ({
    ...section,
    questions: (section.shuffleQuestions
      ? shuffleArray(section.questions)
      : section.questions
    ).map((q) =>
      q.shuffleOptions && q.options && q.options.length > 1
        ? { ...q, options: shuffleArray(q.options) }
        : q
    ),
  }));
  let counter = 1;
  return shuffled.map((section) => ({
    ...section,
    questions: section.questions.map((q) => ({ ...q, number: counter++ })),
  }));
};

export const ExamInterface: React.FC<ExamInterfaceProps> = ({
  examData,
  studentName,
  studentEmail = '',
  sessionKey,
  jwtToken = '',
  isJwtMode = false,
  onSubmit,
  onViolation,
  onSuppressViolations,
  onPhaseActive,
  violations,
}) => {
  const recording     = examData.recording ?? {};
  const needsRecording = !!(recording.camera || recording.screen);

  // Sections are NOT available at mount — they're fetched when the exam starts.
  const [activeSections, setActiveSections] = useState<Section[]>([]);

  const allQuestions = activeSections.flatMap((section) =>
    section.questions.map((q) => ({
      ...q,
      sectionId:   section.sectionId,
      sectionName: section.sectionName,
    }))
  );

  // Stable map from questionId → render-order number; used when scoring.
  const questionOrderMapRef = useRef<Record<string, number>>({});
  questionOrderMapRef.current = Object.fromEntries(allQuestions.map((q) => [q.id, q.number]));

  // Verbal audio blobs: questionId → recorded Blob (set by VerbalRecorder inside QuestionDisplay)
  const verbalBlobsRef = useRef<Map<string, Blob>>(new Map());

  // Tracks questionIds whose audio was already successfully uploaded to the server
  // at recording-completion time — skip re-uploading these at submit.
  const uploadedVerbalRef = useRef<Set<string>>(new Set());
  // Verbal uploads deferred because re-record was still available; sent on navigation away.
  const pendingVerbalUploadRef = useRef<Set<string>>(new Set());

  const handleVerbalRecorded = useCallback((questionId: string, blob: Blob) => {
    verbalBlobsRef.current.set(questionId, blob);

    const question = allQuestionsRef.current.find(q => q.id === questionId);
    const canRerecord = (question?.allowRerecord ?? false) && !timedOutQuestionsRef.current.has(questionId);

    if (!canRerecord) {
      // allowRerecord is false OR question is locked — upload immediately.
      const sk  = sessionKeyRef.current;
      const url = jwtToken
        ? `${BACKEND_URL}/api/result/audio/${sk}/${questionId}?token=${encodeURIComponent(jwtToken)}`
        : `${BACKEND_URL}/api/result/audio/${sk}/${questionId}`;
      const form = new FormData();
      form.append('file', blob, `verbal_${questionId}.webm`);
      fetch(url, { method: 'POST', body: form })
        .then(r => {
          if (r.ok) {
            uploadedVerbalRef.current.add(questionId);
            console.log(`[verbal] upload OK for question ${questionId}`);
          } else {
            console.warn(`[verbal] upload failed (HTTP ${r.status}) for ${questionId} — will retry at submit`);
          }
        })
        .catch(e => {
          console.warn(`[verbal] upload error for ${questionId} — will retry at submit:`, e);
        });
    } else {
      // allowRerecord is true — defer until user explicitly submits or navigates away.
      pendingVerbalUploadRef.current.add(questionId);
      console.log(`[verbal] deferred upload for ${questionId} (allowRerecord=true)`);
    }
  }, [jwtToken]);

  // exam phases: jd (jwt only) → setup → disclaimer → active
  const initialPhase = (): 'jd' | 'setup' | 'disclaimer' | 'active' => {
    if (isJwtMode && examData.jobDescription?.trim()) return 'jd';
    return needsRecording ? 'setup' : 'disclaimer';
  };
  const [examPhase, setExamPhase]       = useState<'jd' | 'setup' | 'disclaimer' | 'active'>(initialPhase);
  const [cameraReady, setCameraReady]   = useState(!recording.camera);
  const [screenReady, setScreenReady]   = useState(!recording.screen);
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [questionLoadError, setQuestionLoadError]   = useState('');

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers]             = useState<Answer[]>([]);
  const [questionStatuses, setQuestionStatuses] = useState<QuestionStatus[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(examData.duration);
  const [showNavigator, setShowNavigator] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [timedOutQuestions, setTimedOutQuestions] = useState<Set<string>>(new Set());
  const timedOutQuestionsRef = useRef(timedOutQuestions);
  timedOutQuestionsRef.current = timedOutQuestions;
  const [verbalRecordingStarted, setVerbalRecordingStarted] = useState<Set<string>>(new Set());
  const questionTimerSecondsRef = useRef<Record<string, number>>({});
  const [currentQTimerDisplay, setCurrentQTimerDisplay] = useState<number | null>(null);

  const allQuestionsRef = useRef(allQuestions);
  allQuestionsRef.current = allQuestions;

  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const jwtTokenRef = useRef(jwtToken);
  jwtTokenRef.current = jwtToken;

  const answersRef = useRef<Answer[]>([]);
  answersRef.current = answers;

  // Initialize question statuses once sections are loaded
  useEffect(() => {
    if (allQuestions.length > 0 && questionStatuses.length === 0) {
      setQuestionStatuses(
        allQuestions.map((q) => ({ questionId: q.id, status: 'not-visited' }))
      );
    }
  }, [activeSections]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist answers to localStorage while exam is active (for beacon / crash-recovery)
  useEffect(() => {
    if (examPhase !== 'active') return;
    localStorage.setItem('qs_exam_answers', JSON.stringify(answers));
  }, [answers, examPhase]);

  // Save the stable order map once when the exam goes active
  useEffect(() => {
    if (examPhase !== 'active') return;
    localStorage.setItem('qs_exam_order_map', JSON.stringify(questionOrderMapRef.current));
  }, [examPhase]);

  const {
    initCameraStream,
    initScreenStream,
    beginRecording,
    restartScreenRecording,
    stopAllRecording,
    screenStatus,
    cameraError,
    screenError,
    setCameraError,
    setScreenError,
  } = useExamRecorder(sessionKey);

  // ── Verbal auto-start: VerbalRecorder handles its own countdown internally.
  // We just need to ensure the answer state is updated when recording completes.
  // (VerbalRecorder calls onVerbalRecorded → handleVerbalRecorded stores the blob;
  //  onAnswerChange('recorded') marks the question as answered in the navigator.)

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

  // When the user navigates away from a question, fire any deferred verbal uploads for it.
  useEffect(() => {
    if (examPhase !== 'active') return;
    const currentId = allQuestionsRef.current[currentQuestionIndex]?.id;
    for (const questionId of [...pendingVerbalUploadRef.current]) {
      if (questionId === currentId) continue;
      const q = allQuestionsRef.current.find(q => q.id === questionId);
      if (q?.allowRerecord) continue; // upload only on explicit submit, timer expiry, or exam submit
      const blob = verbalBlobsRef.current.get(questionId);
      if (!blob) { pendingVerbalUploadRef.current.delete(questionId); continue; }
      pendingVerbalUploadRef.current.delete(questionId);
      const sk  = sessionKeyRef.current;
      const url = jwtToken
        ? `${BACKEND_URL}/api/result/audio/${sk}/${questionId}?token=${encodeURIComponent(jwtToken)}`
        : `${BACKEND_URL}/api/result/audio/${sk}/${questionId}`;
      const form = new FormData();
      form.append('file', blob, `verbal_${questionId}.webm`);
      fetch(url, { method: 'POST', body: form })
        .then(r => {
          if (r.ok) {
            uploadedVerbalRef.current.add(questionId);
            console.log(`[verbal] deferred upload OK for ${questionId}`);
          } else {
            console.warn(`[verbal] deferred upload failed (HTTP ${r.status}) for ${questionId} — will retry at submit`);
          }
        })
        .catch(e => {
          console.warn(`[verbal] deferred upload error for ${questionId} — will retry at submit:`, e);
        });
    }
  }, [currentQuestionIndex, examPhase, jwtToken]);

  // Stop recording on unmount regardless of how exam ends
  useEffect(() => {
    return () => { stopAllRecording(); };
  }, []);

  // When screen share stops mid-exam: reset ready state and fire a violation
  useEffect(() => {
    if (screenStatus === 'stopped' && recording.screen) {
      setScreenReady(false);
      if (examPhase === 'active') {
        onViolation?.();
      }
    }
  }, [screenStatus]);

  // Main exam timer — only runs when exam is active
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

  const handleVerbalRecordingStarted = useCallback((questionId: string) => {
    setVerbalRecordingStarted(prev => new Set([...prev, questionId]));
  }, []);

  const handleSubmitVerbalRecording = useCallback((questionId: string) => {
    pendingVerbalUploadRef.current.delete(questionId);
    const blob = verbalBlobsRef.current.get(questionId);
    if (!blob || uploadedVerbalRef.current.has(questionId)) return;
    const sk  = sessionKeyRef.current;
    const url = jwtToken
      ? `${BACKEND_URL}/api/result/audio/${sk}/${questionId}?token=${encodeURIComponent(jwtToken)}`
      : `${BACKEND_URL}/api/result/audio/${sk}/${questionId}`;
    const form = new FormData();
    form.append('file', blob, `verbal_${questionId}.webm`);
    fetch(url, { method: 'POST', body: form })
      .then(r => {
        if (r.ok) {
          uploadedVerbalRef.current.add(questionId);
          console.log(`[verbal] submit-button upload OK for ${questionId}`);
        } else {
          console.warn(`[verbal] submit-button upload failed (HTTP ${r.status}) for ${questionId}`);
        }
      })
      .catch(e => console.warn(`[verbal] submit-button upload error for ${questionId}:`, e));
  }, [jwtToken]);

  // Per-question timer — for verbal questions, waits until the student starts recording
  useEffect(() => {
    if (examPhase !== 'active' || !currentQuestion?.timeLimit) {
      setCurrentQTimerDisplay(null);
      return;
    }
    const qId       = currentQuestion.id;
    const timeLimit = currentQuestion.timeLimit;

    // Verbal questions: don't start the timer until the mic is actually recording
    if (currentQuestion.type === 'verbal' && !verbalRecordingStarted.has(qId)) {
      setCurrentQTimerDisplay(null);
      return;
    }

    if (questionTimerSecondsRef.current[qId] === undefined) {
      questionTimerSecondsRef.current[qId] = timeLimit;
    }
    setCurrentQTimerDisplay(questionTimerSecondsRef.current[qId]);

    const interval = setInterval(() => {
      const remaining = questionTimerSecondsRef.current[qId];
      if (remaining <= 1) {
        clearInterval(interval);
        questionTimerSecondsRef.current[qId] = 0;
        setCurrentQTimerDisplay(0);
        setTimedOutQuestions(prev => new Set([...prev, qId]));
        if (pendingVerbalUploadRef.current.has(qId) && !uploadedVerbalRef.current.has(qId)) {
          const blob = verbalBlobsRef.current.get(qId);
          if (blob) {
            pendingVerbalUploadRef.current.delete(qId);
            const sk    = sessionKeyRef.current;
            const token = jwtTokenRef.current;
            const url   = token
              ? `${BACKEND_URL}/api/result/audio/${sk}/${qId}?token=${encodeURIComponent(token)}`
              : `${BACKEND_URL}/api/result/audio/${sk}/${qId}`;
            const form  = new FormData();
            form.append('file', blob, `verbal_${qId}.webm`);
            fetch(url, { method: 'POST', body: form })
              .then(r => { if (r.ok) uploadedVerbalRef.current.add(qId); });
          }
        }
        setCurrentQuestionIndex(prev => {
          const questions = allQuestionsRef.current;
          return prev < questions.length - 1 ? prev + 1 : prev;
        });
      } else {
        questionTimerSecondsRef.current[qId] = remaining - 1;
        setCurrentQTimerDisplay(remaining - 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentQuestionIndex, examPhase, verbalRecordingStarted]);

  // ── Setup phase handlers ─────────────────────────────────────────────────────

  const handleStartCamera = async () => {
    setCameraError(null);
    const ok = await initCameraStream();
    if (ok) setCameraReady(true);
  };

  const handleStartScreenShare = async () => {
    setScreenError(null);
    onSuppressViolations(10_000);
    const ok = await initScreenStream();
    if (!ok) return;
    setScreenReady(true);
    if (examPhase === 'active') restartScreenRecording();
  };

  const handleBeginExam = () => setExamPhase('disclaimer');

  /**
   * "Start Exam" on the disclaimer page:
   * 1. Fetch questions from the server (JWT-protected — not loaded earlier).
   * 2. Initialize activeSections with shuffle applied.
   * 3. Begin recording, go active.
   */
  const handleStartExam = async () => {
    setIsLoadingQuestions(true);
    setQuestionLoadError('');

    const sections = await loadExamQuestions(examData.examCode, jwtToken);

    if (!sections || sections.length === 0) {
      setIsLoadingQuestions(false);
      setQuestionLoadError('Failed to load exam questions. Please check your connection and try again.');
      return;
    }

    const initialized = initializeSections(sections);
    setActiveSections(initialized);
    setIsLoadingQuestions(false);

    if (needsRecording) beginRecording();
    setExamPhase('active');
    onPhaseActive();
  };

  // ── Exam phase handlers ──────────────────────────────────────────────────────

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

  const handleClearResponse = () => {
  setAnswers((prev) => prev.filter((a) => a.questionId !== currentQuestion.id));
  setQuestionStatuses((prev) =>
    prev.map((s) =>
      s.questionId === currentQuestion.id ? { ...s, status: 'not-answered' } : s
    )
  );
};

  const handleMarkToggle = () => {
    setAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === currentQuestion.id);
      if (existing) {
        return prev.map((a) =>
          a.questionId === currentQuestion.id ? { ...a, isMarked: !a.isMarked } : a
        );
      }
      return [...prev, { questionId: currentQuestion.id, answer: '', isMarked: true }];
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < allQuestions.length - 1) setCurrentQuestionIndex(currentQuestionIndex + 1);
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0 && examData.canNavigate) setCurrentQuestionIndex(currentQuestionIndex - 1);
  };

  const handleSubmit = () => setShowSubmitModal(true);

  const handleConfirmSubmit = async () => {
    setShowSubmitModal(false);
    stopAllRecording();

    // Upload verbal audio blobs that were NOT already uploaded at recording time.
    // Blobs uploaded at timer-completion are in uploadedVerbalRef — skip those.
    const sessionKey = sessionKeyRef.current;
    for (const [questionId, blob] of verbalBlobsRef.current.entries()) {
      if (uploadedVerbalRef.current.has(questionId)) {
        // Already uploaded when the verbal timer ended — no need to re-upload.
        continue;
      }
      try {
        const url = jwtToken
          ? `${BACKEND_URL}/api/result/audio/${sessionKey}/${questionId}?token=${encodeURIComponent(jwtToken)}`
          : `${BACKEND_URL}/api/result/audio/${sessionKey}/${questionId}`;
        const form = new FormData();
        form.append('file', blob, `verbal_${questionId}.webm`);
        await fetch(url, { method: 'POST', body: form });
      } catch (e) {
        console.error('Failed to upload verbal audio for question', questionId, e);
      }
    }

    // Submit exam (ResultService will fire async verbal evaluation calls after saving)
    onSubmit(answersRef.current, questionOrderMapRef.current);
  };

  const currentAnswer = answers.find((a) => a.questionId === currentQuestion?.id);

  // ── JD Phase ────────────────────────────────────────────────────────────────
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

  // ── Loading questions overlay ────────────────────────────────────────────────
  if (isLoadingQuestions) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-10 text-center max-w-xs w-full">
          <div className="flex justify-center mb-5">
            <svg className="animate-spin w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-lg font-bold text-gray-800 mb-1">Starting Exam…</p>
          <p className="text-sm text-gray-500">Loading your questions. Please wait.</p>
        </div>
      </div>
    );
  }

  // ── Setup Phase ──────────────────────────────────────────────────────────────
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
              <div className={`flex items-center gap-4 p-4 rounded-lg border-2 transition ${
                cameraReady ? 'border-green-400 bg-green-50' : 'border-gray-200'
              }`}>
                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                  cameraReady ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800">Camera &amp; Microphone</p>
                  <p className="text-sm text-gray-500 truncate">
                    {cameraReady ? 'Active' : cameraError ? `Error: ${cameraError}` : 'Click Grant to allow access'}
                  </p>
                </div>
                {!cameraReady && (
                  <button onClick={handleStartCamera}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">
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
              <div className={`flex items-center gap-4 p-4 rounded-lg border-2 transition ${
                screenReady ? 'border-green-400 bg-green-50' : 'border-gray-200'
              }`}>
                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                  screenReady ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800">Screen Recording</p>
                  <p className="text-sm text-gray-500 truncate">
                    {screenReady ? 'Sharing entire screen' : screenError ? screenError
                      : 'You must share your entire screen (not a window or tab)'}
                  </p>
                </div>
                {!screenReady && (
                  <button onClick={handleStartScreenShare}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">
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

          <button onClick={handleBeginExam} disabled={!allReady}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed text-lg">
            Begin Exam
          </button>
          {!allReady && (
            <p className="text-center text-xs text-gray-400 mt-3">Complete all recording steps before starting.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Screen-share-stopped blocker ─────────────────────────────────────────────
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
          </p>
          {screenError && (
            <p className="text-red-500 text-xs mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{screenError}</p>
          )}
          <button onClick={handleStartScreenShare}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-sm">
            Share Screen
          </button>
        </div>
      </div>
    );
  }

  // ── Disclaimer Phase ─────────────────────────────────────────────────────────
  if (examPhase === 'disclaimer') {
    const maxV  = examData.maxViolations ?? 3;
    const rules = [
      { title: 'Fullscreen Required',        desc: 'The exam runs in fullscreen. Exiting fullscreen is counted as a violation.' },
      { title: 'No Tab Switching',           desc: 'Switching tabs or minimising the browser window counts as a violation.' },
      { title: 'You can click on hide button next to stop screen share', desc: 'Dont click on stop screen sharing as you might get disqualified.' },
      { title: 'No Right-Click',             desc: 'Right-clicking is disabled for the duration of the exam.' },
      { title: 'No Page Refresh',            desc: 'Refreshing the page (F5 / Ctrl+R) is blocked. It may cause loss of your answers.' },
      ...(recording.camera ? [{ title: 'Camera & Microphone Recording', desc: 'Your webcam and audio are being recorded throughout the exam.' }] : []),
      ...(recording.screen ? [{ title: 'Screen Recording', desc: 'Your entire screen is being recorded throughout the exam.' }] : []),
      { title: `${maxV} Violations = Auto-Submit`, desc: `Reaching ${maxV} violations will automatically submit your exam.` },
    ];

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full max-h-screen overflow-y-auto">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex-shrink-0 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Exam Rules &amp; Guidelines</h2>
              <p className="text-sm text-gray-500">Read carefully before starting</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-sm text-blue-800">
            <span className="font-semibold">{examData.examTitle}</span>
            <span className="mx-2 text-blue-300">|</span>
            Code: {examData.examCode}
            <span className="mx-2 text-blue-300">|</span>
            Duration: {Math.floor(examData.duration / 60)} min
          </div>

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

          {questionLoadError && (
            <p className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {questionLoadError}
            </p>
          )}

          <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
            <input type="checkbox" checked={disclaimerAgreed}
              onChange={(e) => setDisclaimerAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
            <span className="text-sm text-gray-700">
              I have read and understood all the rules above and agree to comply with the proctoring requirements.
            </span>
          </label>

          <button onClick={handleStartExam} disabled={!disclaimerAgreed}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed text-lg">
            Start Exam
          </button>
        </div>
      </div>
    );
  }

  // ── Active Exam UI ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Submit confirmation modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Submit Exam?</h2>
            <p className="text-gray-500 text-sm mb-1">
              You have answered{' '}
              <span className="font-semibold text-gray-700">
                {answers.filter(a => {
                  const ans = a.answer;
                  return Array.isArray(ans) ? ans.length > 0 : ans !== '';
                }).length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-gray-700">{allQuestions.length}</span>{' '}questions.
            </p>
            <p className="text-gray-400 text-xs mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition text-sm">
                Cancel
              </button>
              <button onClick={handleConfirmSubmit}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition text-sm">
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Watermark */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center"
        style={{ fontSize: '120px', color: 'rgba(0,0,0,0.03)', fontWeight: 'bold',
          transform: 'rotate(-45deg)', userSelect: 'none' }}>
        {studentName}
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="bg-white shadow-md border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{examData.examTitle}</h1>
              <p className="text-sm text-gray-600">Student: {studentName} | Code: {examData.examCode}</p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {recording.camera && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className={`w-2 h-2 rounded-full ${cameraReady ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
                  {cameraReady ? 'Cam REC' : 'Cam Off'}
                </div>
              )}
              {recording.screen && screenStatus === 'sharing' && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Screen REC
                </div>
              )}
              <div className="text-right">
                <div className={`text-2xl font-bold ${timeRemaining < 300 ? 'text-red-600' : 'text-gray-800'}`}>
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
            {currentQTimerDisplay !== null && (
              <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium ${
                currentQTimerDisplay <= 10
                  ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                  : currentQTimerDisplay <= 30
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                <span>⏱ Question Time</span>
                <span className="font-bold tabular-nums text-base">
                  {formatTime(currentQTimerDisplay)}
                  {currentQTimerDisplay <= 10 && (
                    <span className="ml-2 text-xs font-normal">auto-advancing…</span>
                  )}
                </span>
              </div>
            )}

            {currentQuestion && (
              <QuestionDisplay
                key={currentQuestion.id}
                question={currentQuestion}
                answer={currentAnswer}
                onAnswerChange={handleAnswerChange}
                onMarkToggle={handleMarkToggle}
                sectionName={currentQuestion.sectionName}
                locked={timedOutQuestions.has(currentQuestion.id)}
                onVerbalRecorded={handleVerbalRecorded}
                onVerbalRecordingStarted={handleVerbalRecordingStarted}
                onSubmitVerbalRecording={handleSubmitVerbalRecording}
              />
            )}

            <div className="bg-white rounded-lg p-4 flex items-center justify-between">
              <button onClick={handlePrevious}
                disabled={currentQuestionIndex === 0 || !examData.canNavigate}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium">
                Previous
              </button>
              <div className="text-sm text-gray-600">Question {currentQuestionIndex + 1} of {allQuestions.length}</div>
              
              <div className="flex items-center gap-[10px]">
              <button
                onClick={handleClearResponse}
                disabled={
                !currentAnswer ||
                (Array.isArray(currentAnswer.answer)
                ? currentAnswer.answer.length === 0
                : currentAnswer.answer === '') ||
                currentQuestion?.type === 'verbal' ||
                currentQuestion?.type === 'subjective'
              }
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition font-medium text-sm">
                Clear Response
              </button>
              <button onClick={handleNext}
                disabled={currentQuestionIndex === allQuestions.length - 1}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium">
                {currentQuestionIndex === allQuestions.length - 1 ? 'Last Question' : 'Next'}
              </button>
            </div>
            </div>

            <div className="bg-white rounded-lg p-4 flex items-center justify-between">
              <button onClick={() => setShowNavigator(!showNavigator)}
                className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition font-medium lg:hidden">
                {showNavigator ? 'Hide Navigator' : 'Show Navigator'}
              </button>
              <button onClick={handleSubmit}
                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-lg ml-auto">
                Submit Exam
              </button>
            </div>
          </div>

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
