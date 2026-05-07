import { useState, useRef } from 'react';
import { ExamLogin } from './components/ExamLogin';
import { ExamInterface } from './components/ExamInterface';
import { ResultScreen } from './components/ResultScreen';
import { FullscreenManager } from './components/FullscreenManager';
import { ExamData, Answer } from './types/exam';
import { calculateScore } from './utils/examUtils';

type AppState = 'login' | 'exam' | 'result';

const generateSessionKey = (name: string, examCode: string): string => {
  const ts = Date.now();
  const safeName = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return `${safeName}_${examCode}_${ts}`;
};

function App() {
  const [state, setState] = useState<AppState>('login');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [studentName, setStudentName] = useState('');
  const [sessionKey, setSessionKey] = useState('');
  const [violations, setViolations] = useState(0);
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
    setViolations(0);
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
  };

  const handleRestart = () => {
    setState('login');
    setExamData(null);
    setStudentName('');
    setSessionKey('');
    setViolations(0);
    setResultData(null);
  };

  return (
    <FullscreenManager examActive={state === 'exam'} onViolation={handleViolation}>
      {state === 'login' && <ExamLogin onStart={handleExamStart} />}

      {state === 'exam' && examData && (
        <ExamInterface
          examData={examData}
          studentName={studentName}
          sessionKey={sessionKey}
          onSubmit={handleExamSubmit}
          onSuppressViolations={handleSuppressViolations}
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
