export interface Option {
  id: string;
  text: string;
  type: 'text' | 'image';
}

export interface Question {
  id: string;
  number: number;
  type: 'mcq' | 'subjective' | 'verbal';
  multipleChoice?: boolean;
  shuffleOptions?: boolean;
  question: string;
  options?: Option[];
  correctAnswer?: string[];  // stripped from public API — scoring is done server-side
  marks: number;
  negativeMarks: number;
  timeLimit: number | null;
  // verbal-only fields
  maxDuration?: number;      // seconds the recording runs before auto-stop
  autoStartDelay?: number;   // seconds before recording starts automatically (0 = manual)
  expectedReply?: string;    // reference answer sent to python code — never shown to student
  precision?: number;        // 1–5 strictness for AI evaluation
}

export interface Section {
  sectionId: string;
  sectionName: string;
  shuffleQuestions?: boolean;
  questions: Question[];
}

export interface GradeRule {
  grade: string;
  minPercentage: number;
}

export interface RecordingConfig {
  camera?: boolean;
  screen?: boolean;
}

export interface ResultDisplayConfig {
  showStudentName?: boolean;
  showExamCode?: boolean;
  showScore?: boolean;
  showTotalMarks?: boolean;
  showGrade?: boolean;
  showPerformanceSummary?: boolean;
  showPdfDownload?: boolean;
  showRetakeButton?: boolean;
  /**
   * Controls what is included in the downloaded PDF report.
   * "marks-only"  — final score and percentage only
   * "summary"     — question number + correct/wrong + marks per question (default)
   * "detailed"    — full question text, all options with correct/user highlights, and marks
   */
  pdfMode?: 'marks-only' | 'summary' | 'detailed';
}

export interface ExamData {
  examCode: string;
  examTitle: string;
  duration: number;
  canNavigate: boolean;
  submissionType: 'complete' | 'sectionwise';
  maxViolations?: number;
  grading?: GradeRule[];
  recording?: RecordingConfig;
  resultDisplay?: ResultDisplayConfig;
  jobDescription?: string;
  sections?: Section[];  // absent in the metadata-only API response; loaded separately
}

export interface Answer {
  questionId: string;
  answer: string | string[];
  isMarked?: boolean;
}

export interface QuestionStatus {
  questionId: string;
  status: 'not-visited' | 'not-answered' | 'answered' | 'marked';
}
