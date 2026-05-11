import { useState, useRef } from 'react';
import { ExamLogin } from './components/ExamLogin';
import { ExamInterface } from './components/ExamInterface';
import { ResultScreen } from './components/ResultScreen';
import { FullscreenManager } from './components/FullscreenManager';
import { ExamData, Answer } from './types/exam';
import { calculateScore } from './utils/examUtils';
import { BACKEND_URL } from './config';

type AppState = 'login' | 'exam' | 'result';

const generateSessionKey = (name: string, examCode: string): string => {
  const ts = Date.now();
  const safeName = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return `${safeName}_${examCode}_${ts}`;
};

/** Resolve a grade string from grading rules, returns '' if no grading config. */
const resolveGrade = (examData: ExamData, score: number, totalMarks: number): string => {
  if (!examData.grading || examData.grading.length === 0) return '';
  const pct = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
  const match = [...examData.grading]
    .sort((a, b) => b.minPercentage - a.minPercentage)
    .find((g) => pct >= g.minPercentage);
  return match ? match.grade : 'F';
};

function App() {
  const [state, setState] = useState<AppState>('login');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [studentName, setStudentName] = useState('');
  const [sessionKey, setSessionKey] = useState('');
  const [violations, setViolations] = useState(0);
  const [examPhase, setExamPhase] = useState<'setup' | 'disclaimer' | 'active'>('setup');
  const [examStartTime, setExamStartTime] = useState<string | null>(null);
  const [resultData, setResultData] = useState<{
    score: number;
    totalMarks: number;
    details: any[];
  } | null>(null);

  // suppressUntil allows ExamInterface to mute violations briefly (e.g. during screen share picker)
  const suppressUntil = useRef<number>(0);

  const handleExamStart = (data: ExamData, name: string) => {
    setExamData(data);
    setStudentName(name);
    setSessionKey(generateSessionKey(name, data.examCode));
    setState('exam');
    setExamLive(false);
    setViolations(0);
    const needsRecording = !!(data.recording?.camera || data.recording?.screen);
    setExamPhase(needsRecording ? 'setup' : 'disclaimer');
    setExamStartTime(new Date().toISOString());
  };

  const handleExamLive = () => {
    setExamLive(true);
  };

  const handleViolation = () => {
    if (Date.now() < suppressUntil.current) return;
    setViolations((v) => {
      const newCount = v + 1;
      const maxV = examData?.maxViolations ?? 3;
      if (newCount >= maxV) {
        alert('Too many violations. Test auto submitted.');
        if (examData) {
          handleExamSubmit([]);
        }
      }
      return newCount;
    });
  };

  const handleSuppressViolations = (ms: number) => {
    suppressUntil.current = Date.now() + ms;
  };

  const handleExamSubmit = (answers: Answer[], questionOrderMap: Record<string, number> = {}) => {
    if (!examData) return;
    const result = calculateScore(examData, answers, questionOrderMap);
    setResultData(result);
    setState('result');
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    // Persist result to backend (fire-and-forget — never blocks the UI)
    persistResult(examData, result.score, result.totalMarks, result.details);
  };

  /**
   * Sends the exam result to the backend for DB persistence and HTML report storage.
   * The HTML report is saved at:
   *   {storage.base-path}/{sessionKey}/{sessionKey}.html
   * (sessionKey follows the name_examcode_time pattern, camera/ and screen/ are untouched)
   */
  const persistResult = (
    data: ExamData,
    score: number,
    totalMarks: number,
    details: any[]
  ) => {
    const grade = resolveGrade(data, score, totalMarks);
    const payload = {
      sessionKey,
      studentName,
      examCode: data.examCode,
      examTitle: data.examTitle,
      score,
      totalMarks,
      grade: grade || null,
      details,
      startedAt: examStartTime,
    };

    fetch(`${BACKEND_URL}/api/result/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => console.error('[exam] Failed to persist result to backend:', err));
  };

  const handleRestart = () => {
    setState('login');
    setExamData(null);
    setStudentName('');
    setSessionKey('');
    setViolations(0);
    setExamPhase('setup');
    setResultData(null);
    setExamStartTime(null);
  };

  return (
    <FullscreenManager examActive={state === 'exam' && examPhase === 'active'} onViolation={handleViolation}>
      {state === 'login' && <ExamLogin onStart={handleExamStart} />}

      {state === 'exam' && examData && (
        <ExamInterface
          examData={examData}
          studentName={studentName}
          sessionKey={sessionKey}
          onSubmit={handleExamSubmit}
          onBeginExam={handleExamLive}
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
    </FullscreenManager>
  );
}

export default App;
