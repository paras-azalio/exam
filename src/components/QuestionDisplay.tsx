import React from 'react';
import { Question, Answer } from '../types/exam';

interface QuestionDisplayProps {
  question: Question;
  answer: Answer | undefined;
  onAnswerChange: (answer: string | string[]) => void;
  onMarkToggle: () => void;
  sectionName: string;
  /** When true, all answer inputs are disabled (e.g. per-question timer expired). */
  locked?: boolean;
}

export const QuestionDisplay: React.FC<QuestionDisplayProps> = ({
  question,
  answer,
  onAnswerChange,
  onMarkToggle,
  sectionName,
  locked = false,
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
      // Single-choice: clicking selected option again deselects it
      onAnswerChange(isSelected(optionId) ? '' : optionId);
    }
  };

  const handleSubjectiveChange = (text: string) => {
    if (locked) return;
    onAnswerChange(text);
  };

  return (
    <div className={`bg-white rounded-lg p-6 space-y-6 ${locked ? 'opacity-80' : ''}`}>

      {/* Locked banner */}
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
          {!locked && (
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

      {question.type === 'mcq' && question.options && (
        <div className="space-y-3">
          {question.multipleChoice && !locked && (
            <p className="text-sm text-blue-600 font-medium">Multiple answers can be selected</p>
          )}
          {question.options.map((option) => (
            <label
              key={option.id}
              onClick={(e) => {
                // For single-choice radios, onChange never fires when re-clicking an already-checked
                // option because the value hasn't changed. Handle deselect via the label click and
                // prevent the default so the radio's own handler doesn't double-fire.
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
                onChange={() => {
                  // Checkboxes (multipleChoice) use onChange; single-choice is handled by label onClick above
                  if (question.multipleChoice) handleMCQChange(option.id);
                }}
                disabled={locked}
                className="w-5 h-5 disabled:cursor-not-allowed"
              />
              {option.type === 'text' ? (
                <span className={locked ? 'text-gray-500' : 'text-gray-800'}>{option.text}</span>
              ) : (
                <img
                  src={option.text}
                  alt={`Option ${option.id}`}
                  className="max-w-xs max-h-48 object-contain rounded"
                />
              )}
            </label>
          ))}
        </div>
      )}

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
    </div>
  );
};
