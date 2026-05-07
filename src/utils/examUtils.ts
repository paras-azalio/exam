import { ExamData, Answer, Question } from '../types/exam';

export const loadExamData = async (examCode: string): Promise<ExamData | null> => {
  try {
    const response = await fetch(`/exams/${examCode}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error loading exam:', error);
    return null;
  }
};

export const calculateScore = (
  examData: ExamData,
  answers: Answer[],
  questionOrderMap: Record<string, number> = {}
): { score: number; totalMarks: number; details: any[] } => {
  let score = 0;
  let totalMarks = 0;
  const details: any[] = [];

  examData.sections.forEach((section) => {
    section.questions.forEach((question) => {
      totalMarks += question.marks;
      const userAnswer = answers.find((a) => a.questionId === question.id);
      // Use the render-order number if provided, otherwise fall back to JSON number
      const displayNumber = questionOrderMap[question.id] ?? question.number;

      if (!userAnswer) {
        details.push({
          questionId: question.id,
          questionNumber: displayNumber,
          questionText: question.question,
          questionType: question.type,
          options: question.options,
          correctAnswer: question.correctAnswer,
          userAnswer: null,
          correct: false,
          marksAwarded: 0,
          totalMarks: question.marks,
        });
        return;
      }

      const isCorrect = checkAnswer(question, userAnswer.answer);

      if (isCorrect) {
        score += question.marks;
        details.push({
          questionId: question.id,
          questionNumber: displayNumber,
          questionText: question.question,
          questionType: question.type,
          options: question.options,
          correctAnswer: question.correctAnswer,
          userAnswer: userAnswer.answer,
          correct: true,
          marksAwarded: question.marks,
          totalMarks: question.marks,
        });
      } else {
        const penalty = question.negativeMarks || 0;
        score -= penalty;
        details.push({
          questionId: question.id,
          questionNumber: displayNumber,
          questionText: question.question,
          questionType: question.type,
          options: question.options,
          correctAnswer: question.correctAnswer,
          userAnswer: userAnswer.answer,
          correct: false,
          marksAwarded: -penalty,
          totalMarks: question.marks,
        });
      }
    });
  });

  // Sort by the display number so the order always matches what the student saw in the UI,
  // regardless of the original JSON section/question order.
  details.sort((a, b) => a.questionNumber - b.questionNumber);

  return { score: Math.max(0, score), totalMarks, details };
};

const checkAnswer = (question: Question, userAnswer: string | string[]): boolean => {
  if (question.type === 'mcq') {
    if (question.multipleChoice) {
      const userAns = Array.isArray(userAnswer) ? userAnswer.sort() : [userAnswer].sort();
      const correctAns = question.correctAnswer.sort();
      return JSON.stringify(userAns) === JSON.stringify(correctAns);
    } else {
      const userAns = Array.isArray(userAnswer) ? userAnswer[0] : userAnswer;
      return userAns === question.correctAnswer[0];
    }
  } else {
    const userAns = (Array.isArray(userAnswer) ? userAnswer[0] : userAnswer).toLowerCase().trim();
    return question.correctAnswer.some((ans) => ans.toLowerCase().trim() === userAns);
  }
};

export const formatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
