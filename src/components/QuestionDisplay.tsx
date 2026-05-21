import React, { useState, useEffect, useRef } from 'react';
import { Question, Answer } from '../types/exam';
import { formatTime } from '../utils/examUtils';

interface QuestionDisplayProps {
  question: Question;
  answer: Answer | undefined;
  onAnswerChange: (answer: string | string[]) => void;
  onMarkToggle: () => void;
  sectionName: string;
  locked?: boolean;
  /** Called when a verbal recording completes — passes the recorded blob. */
  onVerbalRecorded?: (questionId: string, blob: Blob) => void;
}

export const QuestionDisplay: React.FC<QuestionDisplayProps> = ({
  question,
  answer,
  onAnswerChange,
  onMarkToggle,
  sectionName,
  locked = false,
  onVerbalRecorded,
}) => {
  const isSelected = (optionId: string): boolean => {
    if (!answer?.answer) return false;
    if (Array.isArray(answer.answer)) return answer.answer.includes(optionId);
    return answer.answer === optionId;
  };

  const handleMCQChange = (optionId: string) => {
    if (locked) return;
    if (question.multipleChoice) {
      const currentAnswers = Array.isArray(answer?.answer) ? answer.answer : [];
      const newAnswers = currentAnswers.includes(optionId)
        ? currentAnswers.filter((id) => id !== optionId)
        : [...currentAnswers, optionId];
      onAnswerChange(newAnswers);
    } else {
      onAnswerChange(isSelected(optionId) ? '' : optionId);
    }
  };

  const handleSubjectiveChange = (text: string) => {
    if (locked) return;
    onAnswerChange(text);
  };

  return (
    <div className={`bg-white rounded-lg p-6 space-y-6 ${locked ? 'opacity-80' : ''}`}>

      {locked && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 font-medium">
          <span>⏰</span>
          <span>Time expired — this question is locked</span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-gray-500 mb-2">
            Section {sectionName} | Question {question.number}
          </div>
          <div className="flex items-start gap-4">
            <span className="text-2xl font-bold text-gray-800">Q{question.number}.</span>
            <p className="text-lg text-gray-800 mt-1">{question.question}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-sm font-medium text-gray-600">
            Marks: <span className="text-green-600">+{question.marks}</span>
            {question.negativeMarks > 0 && (
              <span className="text-red-600 ml-2">-{question.negativeMarks}</span>
            )}
          </div>
          {!locked && question.type !== 'verbal' && (
            <button
              onClick={onMarkToggle}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                answer?.isMarked
                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {answer?.isMarked ? 'Marked' : 'Mark for Review'}
            </button>
          )}
        </div>
      </div>

      {/* ── MCQ ──────────────────────────────────────────────────────────────── */}
      {question.type === 'mcq' && question.options && (
        <div className="space-y-3">
          {question.multipleChoice && !locked && (
            <p className="text-sm text-blue-600 font-medium">Multiple answers can be selected</p>
          )}
          {question.options.map((option) => (
            <label
              key={option.id}
              onClick={(e) => {
                if (!question.multipleChoice && !locked) {
                  e.preventDefault();
                  handleMCQChange(option.id);
                }
              }}
              className={`flex items-center gap-4 p-4 border-2 rounded-lg transition ${
                locked
                  ? isSelected(option.id)
                    ? 'border-blue-300 bg-blue-50 cursor-not-allowed'
                    : 'border-gray-200 cursor-not-allowed'
                  : isSelected(option.id)
                  ? 'border-blue-500 bg-blue-50 cursor-pointer'
                  : 'border-gray-200 hover:border-gray-300 cursor-pointer'
              }`}
            >
              <input
                type={question.multipleChoice ? 'checkbox' : 'radio'}
                name={`question-${question.id}`}
                value={option.id}
                checked={isSelected(option.id)}
                onChange={() => { if (question.multipleChoice) handleMCQChange(option.id); }}
                disabled={locked}
                className="w-5 h-5 disabled:cursor-not-allowed"
              />
              {option.type === 'text' ? (
                <span className={locked ? 'text-gray-500' : 'text-gray-800'}>{option.text}</span>
              ) : (
                <img src={option.text} alt={`Option ${option.id}`}
                  className="max-w-xs max-h-48 object-contain rounded" />
              )}
            </label>
          ))}
        </div>
      )}

      {/* ── Subjective ────────────────────────────────────────────────────────── */}
      {question.type === 'subjective' && (
        <div>
          <textarea
            value={(answer?.answer as string) || ''}
            onChange={(e) => handleSubjectiveChange(e.target.value)}
            disabled={locked}
            className={`w-full p-4 border-2 rounded-lg outline-none transition resize-none ${
              locked
                ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                : 'border-gray-300 focus:border-blue-500'
            }`}
            rows={6}
            placeholder={locked ? 'Time expired — no changes allowed.' : 'Type your answer here...'}
          />
        </div>
      )}

      {/* ── Verbal ────────────────────────────────────────────────────────────── */}
      {question.type === 'verbal' && (
        <VerbalRecorder
          question={question}
          hasRecording={answer?.answer === 'recorded'}
          onRecorded={(blob) => {
            onVerbalRecorded?.(question.id, blob);
            onAnswerChange('recorded');
          }}
          locked={locked}
        />
      )}
    </div>
  );
};

// ── Verbal Recorder component ─────────────────────────────────────────────────
interface VerbalRecorderProps {
  question: Question;
  hasRecording: boolean;
  onRecorded: (blob: Blob) => void;
  locked: boolean;
}

type RecordState = 'idle' | 'countdown' | 'recording' | 'done';

function VerbalRecorder({ question, hasRecording, onRecorded, locked }: VerbalRecorderProps) {
  const maxDuration    = question.maxDuration    ?? 60;
  const autoStartDelay = question.autoStartDelay ?? 0;

  const [recordState, setRecordState] = useState<RecordState>(hasRecording ? 'done' : 'idle');
  const [countdown, setCountdown]     = useState(autoStartDelay);
  const [elapsed, setElapsed]         = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const streamRef         = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref mirror of playbackUrl so the unmount cleanup closure always sees current value
  const playbackUrlRef    = useRef<string | null>(null);

  useEffect(() => { playbackUrlRef.current = playbackUrl; }, [playbackUrl]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(countdownTimerRef.current!);
      clearInterval(recordTimerRef.current!);
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-start countdown on mount when autoStartDelay > 0 ──────────────────
  useEffect(() => {
    if (autoStartDelay > 0 && !locked && !hasRecording) {
      startCountdown();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-stop when elapsed reaches maxDuration ─────────────────────────────
  useEffect(() => {
    if (elapsed >= maxDuration && recordState === 'recording') {
      stopRecording();
    }
  }, [elapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop immediately when the question is locked (per-question timer expired) ─
  useEffect(() => {
    if (locked && recordState === 'recording') {
      stopRecording();
    }
  }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core recording helpers ──────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
        setPlaybackUrl(url);
        setRecordState('done');
        onRecorded(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mr.start(1000);
      setRecordState('recording');
      setElapsed(0);

      // Simple tick — auto-stop is handled by the useEffect above
      recordTimerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } catch {
      alert('Microphone access denied. Please allow microphone access.');
    }
  };

  const stopRecording = () => {
    clearInterval(recordTimerRef.current!);
    recordTimerRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const startCountdown = () => {
    if (autoStartDelay === 0) { startRecording(); return; }
    setCountdown(autoStartDelay);
    setRecordState('countdown');
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current!);
          startRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /** Reset everything so candidate can try again. */
  const handleReRecord = () => {
    clearInterval(recordTimerRef.current!);
    clearInterval(countdownTimerRef.current!);
    recordTimerRef.current    = null;
    countdownTimerRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current      = null;
    mediaRecorderRef.current = null;
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    setElapsed(0);
    setCountdown(autoStartDelay);
    setRecordState('idle');
  };

  const remaining = maxDuration - elapsed;

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🎤</span>
          <span className="font-semibold text-orange-800 text-sm">Verbal Answer</span>
          <span className="text-xs text-orange-600 ml-auto">Max {formatTime(maxDuration)}</span>
        </div>

        {/* Idle */}
        {recordState === 'idle' && (
          <div className="text-center py-4">
            {autoStartDelay > 0 && (
              <p className="text-sm text-gray-500 mb-3">
                Recording will start in {autoStartDelay}s — or click below to start now.
              </p>
            )}
            {locked ? (
              <p className="text-sm text-gray-400 italic">Recording unavailable — question locked.</p>
            ) : (
              <button onClick={startCountdown}
                className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition text-sm">
                🎙 {autoStartDelay > 0 ? 'Start Now' : 'Start Recording'}
              </button>
            )}
          </div>
        )}

        {/* Countdown */}
        {recordState === 'countdown' && (
          <div className="text-center py-4">
            <div className="text-5xl font-bold text-orange-600 mb-2 tabular-nums">{countdown}</div>
            <p className="text-sm text-gray-500">Recording starts automatically…</p>
            <button
              onClick={() => { clearInterval(countdownTimerRef.current!); startRecording(); }}
              className="mt-3 px-4 py-2 text-xs text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-100 transition"
            >
              Start Now
            </button>
          </div>
        )}

        {/* Recording */}
        {recordState === 'recording' && (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-semibold text-red-600">Recording…</span>
            </div>
            <div className={`text-3xl font-bold tabular-nums mb-3 ${
              remaining <= 10 ? 'text-red-600 animate-pulse' : 'text-gray-700'
            }`}>
              {formatTime(remaining)}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-red-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min((elapsed / maxDuration) * 100, 100)}%` }}
              />
            </div>
            <button
              onClick={stopRecording}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition text-sm"
            >
              ⏹ Stop Recording
            </button>
          </div>
        )}

        {/* Done */}
        {recordState === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
              <span>✓</span>
              <span>Recording saved ({formatTime(Math.min(elapsed, maxDuration))})</span>
            </div>
            {playbackUrl && <audio controls src={playbackUrl} className="w-full h-10" />}
            {!locked && (
              <button
                onClick={handleReRecord}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 transition"
              >
                🔄 Re-record
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
