import React from 'react';
import { ExamData, Section, QuestionStatus, Answer } from '../types/exam';

interface QuestionNavigatorProps {
  examData: ExamData;
  sections: Section[];
  currentQuestionIndex: number;
  answers: Answer[];
  questionStatuses: QuestionStatus[];
  onNavigate: (index: number) => void;
  canNavigate: boolean;
}

export const QuestionNavigator: React.FC<QuestionNavigatorProps> = ({
  sections,
  currentQuestionIndex,
  answers,
  questionStatuses,
  onNavigate,
  canNavigate,
}) => {
  const allQuestions = sections.flatMap((section) =>
    section.questions.map((q) => ({ ...q, sectionId: section.sectionId }))
  );

  const hasContent = (answer: Answer | undefined): boolean => {
    if (!answer) return false;
    return Array.isArray(answer.answer) ? answer.answer.length > 0 : answer.answer !== '';
  };

  const getQuestionStatus = (questionId: string): string => {
    const status = questionStatuses.find((s) => s.questionId === questionId);
    const answer = answers.find((a) => a.questionId === questionId);

    if (answer?.isMarked) return 'marked';
    if (hasContent(answer)) return 'answered';
    if (status?.status === 'not-answered') return 'not-answered';
    return 'not-visited';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'answered':
        return 'bg-green-500 text-white';
      case 'not-answered':
        return 'bg-yellow-500 text-white';
      case 'marked':
        return 'bg-purple-500 text-white';
      default:
        return 'bg-gray-200 text-gray-700';
    }
  };

  // When canNavigate=false, only allow navigating forward (not back)
  const canClickQuestion = (questionIndex: number): boolean => {
    if (canNavigate) return true;
    return questionIndex > currentQuestionIndex;
  };

  const stats = {
    answered: questionStatuses.filter((s) => {
      const answer = answers.find((a) => a.questionId === s.questionId);
      return hasContent(answer) && !answer?.isMarked;
    }).length,
    notAnswered: questionStatuses.filter((s) => {
      const answer = answers.find((a) => a.questionId === s.questionId);
      return s.status === 'not-answered' && !hasContent(answer);
    }).length,
    marked: answers.filter((a) => a.isMarked).length,
    notVisited: questionStatuses.filter((s) => s.status === 'not-visited').length,
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg max-h-[80vh] overflow-y-auto">
      <h3 className="text-lg font-bold mb-4 text-gray-800">Question Navigator</h3>

      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>Answered: {stats.answered}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span>Not Answered: {stats.notAnswered}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-purple-500 rounded"></div>
          <span>Marked: {stats.marked}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded"></div>
          <span>Not Visited: {stats.notVisited}</span>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.sectionId} className="mb-4">
          <h4 className="font-semibold text-sm text-gray-700 mb-2">
            Section {section.sectionId}: {section.sectionName}
          </h4>
          <div className="grid grid-cols-5 gap-2">
            {section.questions.map((question) => {
              const questionIndex = allQuestions.findIndex((q) => q.id === question.id);
              const status = getQuestionStatus(question.id);
              const isCurrent = questionIndex === currentQuestionIndex;
              const clickable = canClickQuestion(questionIndex);

              return (
                <button
                  key={question.id}
                  onClick={() => clickable && onNavigate(questionIndex)}
                  disabled={!clickable}
                  className={`
                    p-2 rounded text-sm font-medium transition
                    ${getStatusColor(status)}
                    ${isCurrent ? 'ring-2 ring-blue-600 ring-offset-2' : ''}
                    ${clickable ? 'hover:opacity-80 cursor-pointer' : 'cursor-not-allowed opacity-60'}
                  `}
                >
                  {question.number}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
