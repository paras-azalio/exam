import { useState, useRef, useEffect } from 'react';
import { ExamInterface } from './components/ExamInterface';
import { ResultScreen } from './components/ResultScreen';
import { FullscreenManager } from './components/FullscreenManager';
import { ViolationModal } from './components/ViolationModal';
import { ExamData, Answer } from './types/exam';
import { loadExamData } from './utils/examUtils';
import { BACKEND_URL } from './config';

type AppState = 'login' | 'exam' | 'result';

const generateSessionKey = (name: string, examCode: string): string => {
  const ts       = Date.now();
  const safeName = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return `${safeName}_${examCode}_${ts}`;
};

/** Decode the payload part of a JWT without verifying the signature. */
const decodeJwtPayload = (token: string): Record<string, any> | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64  = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const CAREERS_URL      = 'https://www.azalio.io/careers/';
const REDIRECT_SECONDS = 10;

function CareersRedirectPage() {
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = CAREERS_URL;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-9 h-9 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Looking for a Job?</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          This page is only accessible via a personalised invite link sent by our team.
          To apply for open positions at Azalio, please visit our careers page.
        </p>
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-full border-4 border-blue-100 flex items-center justify-center">
            <span className="text-xl font-bold text-blue-600">{countdown}</span>
          </div>
          <p className="text-xs text-gray-400">Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}…</p>
        </div>
        <a
          href={CAREERS_URL}
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-sm"
        >
          Go to Careers Page Now
        </a>
      </div>
    </div>
  );
}

function App() {
  const [state, setState]                 = useState<AppState>('login');
  const [examData, setExamData]           = useState<ExamData | null>(null);
  const [studentName, setStudentName]     = useState('');
  const [studentEmail, setStudentEmail]   = useState('');
  const [jwtJti, setJwtJti]               = useState('');
  const [sessionKey, setSessionKey]       = useState('');
  const [violations, setViolations]       = useState(0);
  const [examPhase, setExamPhase]         = useState<'setup' | 'disclaimer' | 'active'>('setup');
  const [examStartTime, setExamStartTime] = useState<string | null>(null);
  const [isJwtMode, setIsJwtMode]         = useState(false);
  const [rawJwtToken, setRawJwtToken]     = useState('');
  const [jwtError, setJwtError]           = useState('');
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [pendingSubmitAnswers, setPendingSubmitAnswers] = useState<Answer[]>([]);
  const [pendingOrderMap, setPendingOrderMap]           = useState<Record<string, number>>({});
  const [resultData, setResultData] = useState<{
    score: number; totalMarks: number; details: any[];
  } | null>(null);

  const suppressUntil = useRef<number>(0);

  // ── JWT invite-link detection ───────────────────────────────────────────────
  const LS_KEY = 'qs_exam_token';

  const startExamFromToken = (token: string) => {
    const payload = decodeJwtPayload(token);
    if (!payload) { setJwtError('Invalid invite link.'); return; }

    // Expired → immediate redirect
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem(LS_KEY);
      window.location.href = 'https://www.azalio.io/';
      return;
    }

    // Not yet valid (nbf) → show friendly "opens on" message
    if (payload.nbf && Date.now() / 1000 < payload.nbf) {
      const opensOn = new Date(payload.nbf * 1000).toLocaleString(undefined, {
        dateStyle: 'long', timeStyle: 'short',
      });
      setJwtError(`This exam link is not yet active. It opens on ${opensOn}.`);
      return;
    }

    const { jti, sub: email, name, examCode } = payload;
    if (!examCode) { setJwtError('Invalid invite link: missing exam code.'); return; }

    // Check if already submitted
    fetch(`${BACKEND_URL}/api/exam/check-token/${jti}`)
      .then(r => r.json())
      .then(data => {
        if (data.used) {
          localStorage.removeItem(LS_KEY);
          localStorage.removeItem('qs_exam_answers');
          localStorage.removeItem('qs_exam_order_map');
          localStorage.removeItem('qs_exam_session_meta');
          setJwtError('This exam has already been submitted. Please contact your administrator if you believe this is a mistake.');
          return;
        }
        return loadExamData(examCode);
      })
      .then(data => {
        if (!data) return;
        if ((data as any).used !== undefined) return; // guard against check-token leaking

        const examDataObj = data as ExamData;

        // ── Crash recovery ────────────────────────────────────────────────────
        // If the browser crashed while an exam was active the beforeunload beacon
        // never fired.  Raw answers are still in localStorage — submit them now.
        const crashAnswersRaw = localStorage.getItem('qs_exam_answers');
        const crashMetaRaw    = localStorage.getItem('qs_exam_session_meta');
        if (crashAnswersRaw && crashMetaRaw) {
          const crashAnswers:  Answer[]               = JSON.parse(crashAnswersRaw);
          const crashOrderMap: Record<string, number> = JSON.parse(
            localStorage.getItem('qs_exam_order_map') ?? '{}'
          );
          const crashMeta: Record<string, string> = JSON.parse(crashMetaRaw);

          // Wipe all crash-recovery data before doing anything else
          ['qs_exam_answers', 'qs_exam_order_map', 'qs_exam_session_meta', LS_KEY]
            .forEach(k => localStorage.removeItem(k));

          setExamData(examDataObj);
          setStudentName(crashMeta.studentName ?? '');
          setIsSubmitting(true);  // show "Submitting…" overlay

          fetch(`${BACKEND_URL}/api/result/save`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionKey:       crashMeta.sessionKey,
              studentName:      crashMeta.studentName,
              studentEmail:     crashMeta.studentEmail  || undefined,
              jti:              crashMeta.jwtJti        || undefined,
              examCode:         examDataObj.examCode,
              examTitle:        examDataObj.examTitle,
              answers:          crashAnswers,
              questionOrderMap: crashOrderMap,
              startedAt:        crashMeta.startTime     || null,
            }),
          })
            .then(r => r.json())
            .then(serverData => {
              setResultData({
                score:      serverData.score      ?? 0,
                totalMarks: serverData.totalMarks ?? 0,
                details:    serverData.details    ?? [],
              });
            })
            .catch(() => {
              setResultData({ score: 0, totalMarks: 0, details: [] });
            })
            .finally(() => {
              setIsSubmitting(false);
              setState('result');
            });

          return;
        }

        // ── Normal exam start ─────────────────────────────────────────────────
        const sk        = generateSessionKey(name ?? 'candidate', examCode);
        const startTime = new Date().toISOString();

        // Persist session metadata for crash-recovery on next reload
        localStorage.setItem('qs_exam_session_meta', JSON.stringify({
          sessionKey:   sk,
          studentName:  name  ?? '',
          studentEmail: email ?? '',
          jwtJti:       jti   ?? '',
          startTime,
        }));

        setStudentName(name ?? '');
        setStudentEmail(email ?? '');
        setJwtJti(jti ?? '');
        setRawJwtToken(token);
        setExamData(examDataObj);
        setSessionKey(sk);
        setViolations(0);
        setExamStartTime(startTime);
        setIsJwtMode(true);
        setState('exam');
      })
      .catch(() => setJwtError('Failed to load exam. Please try again.'));
  };

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const urlToken = params.get('usr');

    if (urlToken) {
      localStorage.setItem(LS_KEY, urlToken);
      window.history.replaceState({}, '', window.location.pathname);
      startExamFromToken(urlToken);
      return;
    }

    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const payload = decodeJwtPayload(stored);
      if (!payload || (payload.exp && Date.now() / 1000 > payload.exp)) {
        localStorage.removeItem(LS_KEY);
        window.location.href = 'https://www.azalio.io/';
        return;
      }
      if (payload.nbf && Date.now() / 1000 < payload.nbf) {
        const opensOn = new Date(payload.nbf * 1000).toLocaleString(undefined, {
          dateStyle: 'long', timeStyle: 'short',
        });
        setJwtError(`This exam link is not yet active. It opens on ${opensOn}.`);
        return;
      }
      startExamFromToken(stored);
    }
  }, []);

  // ── Beacon submit on tab-close / page refresh ──────────────────────────────
  // fetch() is cancelled when the page unloads; sendBeacon is the only API that
  // survives.  We read raw answers from localStorage (continuously synced by
  // ExamInterface) — no client-side scoring, the server does it.
  useEffect(() => {
    if (state !== 'exam' || examPhase !== 'active' || !examData) return;

    const handleUnload = () => {
      const savedAnswers: Answer[]               = JSON.parse(
        localStorage.getItem('qs_exam_answers') ?? '[]'
      );
      const savedOrderMap: Record<string, number> = JSON.parse(
        localStorage.getItem('qs_exam_order_map') ?? '{}'
      );

      const payload = {
        sessionKey,
        studentName,
        studentEmail:     studentEmail  || undefined,
        jti:              jwtJti        || undefined,
        examCode:         examData.examCode,
        examTitle:        examData.examTitle,
        answers:          savedAnswers,
        questionOrderMap: savedOrderMap,
        startedAt:        examStartTime,
      };

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(`${BACKEND_URL}/api/result/save`, blob);
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [state, examPhase, examData, sessionKey, studentName, studentEmail, jwtJti, examStartTime]);

  const handleViolation = () => {
    if (Date.now() < suppressUntil.current) return;
    setViolations((v) => {
      const newCount = v + 1;
      const maxV     = examData?.maxViolations ?? 3;
      if (newCount >= maxV) {
        setPendingSubmitAnswers([]);
        setPendingOrderMap({});
        setShowViolationModal(true);
      }
      return newCount;
    });
  };

  const handleViolationAcknowledge = () => {
    setShowViolationModal(false);
    doSubmit(pendingSubmitAnswers, pendingOrderMap);
  };

  const handleSuppressViolations = (ms: number) => {
    suppressUntil.current = Date.now() + ms;
  };

  const handleExamSubmit = (answers: Answer[], questionOrderMap: Record<string, number> = {}) => {
    doSubmit(answers, questionOrderMap);
  };

  // ── Core submit: sends raw answers, server scores and returns result ─────────
  const doSubmit = async (answers: Answer[], questionOrderMap: Record<string, number>) => {
    if (!examData) return;

    // Exit fullscreen and clear all local state immediately
    if (document.fullscreenElement) document.exitFullscreen();
    localStorage.removeItem('qs_exam_token');
    localStorage.removeItem('qs_exam_answers');
    localStorage.removeItem('qs_exam_order_map');
    localStorage.removeItem('qs_exam_session_meta');

    setIsSubmitting(true);

    const payload = {
      sessionKey,
      studentName,
      studentEmail:     studentEmail  || undefined,
      jti:              jwtJti        || undefined,
      examCode:         examData.examCode,
      examTitle:        examData.examTitle,
      answers,
      questionOrderMap,
      startedAt:        examStartTime,
      violations,
    };

    try {
      const res  = await fetch(`${BACKEND_URL}/api/result/save`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      setResultData({
        score:      data.score      ?? 0,
        totalMarks: data.totalMarks ?? 0,
        details:    data.details    ?? [],
      });
    } catch {
      // Network failure — show result screen with empty data; HTML report was
      // hopefully already written by the beacon if the tab closed.
      setResultData({ score: 0, totalMarks: 0, details: [] });
    } finally {
      setIsSubmitting(false);
      setState('result');
    }
  };

  const handleRestart = () => {
    setState('login');
    setExamData(null);
    setStudentName('');
    setStudentEmail('');
    setJwtJti('');
    setSessionKey('');
    setViolations(0);
    setExamPhase('setup');
    setResultData(null);
    setExamStartTime(null);
    setIsJwtMode(false);
    setRawJwtToken('');
    setJwtError('');
    setIsSubmitting(false);
    setShowViolationModal(false);
  };

  // ── JWT error screen ────────────────────────────────────────────────────────
  if (jwtError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Cannot Start Exam</h2>
          <p className="text-sm text-gray-500 mb-6">{jwtError}</p>
          <button
            onClick={() => setJwtError('')}
            className="w-full bg-slate-800 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-900 transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <FullscreenManager examActive={state === 'exam' && examPhase === 'active'} onViolation={handleViolation}>

      {/* ── Submitting overlay ── */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[99999]">
          <div className="bg-white rounded-2xl shadow-2xl p-10 text-center max-w-xs w-full">
            <div className="flex justify-center mb-5">
              <svg className="animate-spin w-12 h-12 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-800 mb-1">Submitting…</p>
            <p className="text-sm text-gray-500">Please wait while your answers are saved.</p>
          </div>
        </div>
      )}

      {state === 'login' && <CareersRedirectPage />}

      {state === 'exam' && examData && (
        <ExamInterface
          examData={examData}
          studentName={studentName}
          studentEmail={studentEmail}
          sessionKey={sessionKey}
          jwtToken={rawJwtToken}
          isJwtMode={isJwtMode}
          onSubmit={handleExamSubmit}
          onViolation={handleViolation}
          onSuppressViolations={handleSuppressViolations}
          onPhaseActive={() => setExamPhase('active')}
          violations={violations}
        />
      )}

      {state === 'result' && examData && resultData && (
        <ResultScreen
          examData={examData}
          studentName={studentName}
          score={resultData.score}
          totalMarks={resultData.totalMarks}
          details={resultData.details}
          onRestart={handleRestart}
        />
      )}

      {showViolationModal && examData && (
        <ViolationModal
          violations={examData.maxViolations ?? 3}
          maxViolations={examData.maxViolations ?? 3}
          onAcknowledge={handleViolationAcknowledge}
        />
      )}
    </FullscreenManager>
  );
}

export default App;
