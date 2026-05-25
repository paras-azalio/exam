export interface OptionForm {
  id: string;
  text: string;
  isImage: boolean;
}

export interface QuestionForm {
  _key: string;
  type: 'mcq' | 'subjective' | 'verbal';
  question: string;
  multipleChoice: boolean;
  shuffleOptions: boolean;
  options: OptionForm[];
  correctAnswer: string[];
  marks: number;
  negativeMarks: number;
  timeLimit: string;
  // verbal-only
  maxDuration: string;      // input value (seconds)
  autoStartDelay: string;   // input value (seconds, 0 = manual)
  allowRerecord: boolean;   // if true: student can re-record before submitting
  expectedReply: string;
  precision: number;        // 1–5
}

export interface SectionForm {
  _key: string;
  sectionId: string;
  sectionName: string;
  shuffleQuestions: boolean;
  questions: QuestionForm[];
}

export interface GradeForm {
  grade: string;
  minPercentage: number;
}

export interface ExamFormState {
  examCode: string;
  examTitle: string;
  jobDescription: string;
  durationMinutes: number;
  canNavigate: boolean;
  submissionType: string;
  maxViolations: number;
  cameraRecording: boolean;
  screenRecording: boolean;
  cameraPip: boolean;
  grading: GradeForm[];
  showStudentName: boolean;
  showExamCode: boolean;
  showScore: boolean;
  showTotalMarks: boolean;
  showGrade: boolean;
  showPerformanceSummary: boolean;
  showPdfDownload: boolean;
  showRetakeButton: boolean;
  pdfMode: 'marks-only' | 'summary' | 'detailed';
  sections: SectionForm[];
}

const uid = () => Math.random().toString(36).slice(2);

export const DEFAULT_GRADING: GradeForm[] = [
  { grade: 'P', minPercentage: 70 },
  { grade: 'F', minPercentage: 0 },
];

export const emptyQuestion = (): QuestionForm => ({
  _key: uid(),
  type: 'mcq',
  question: '',
  multipleChoice: false,
  shuffleOptions: false,
  options: [
    { id: 'a', text: '', isImage: false },
    { id: 'b', text: '', isImage: false },
    { id: 'c', text: '', isImage: false },
    { id: 'd', text: '', isImage: false },
  ],
  correctAnswer: [],
  marks: 1,
  negativeMarks: 0,
  timeLimit: '',
  maxDuration: '60',
  autoStartDelay: '0',
  allowRerecord: false,
  expectedReply: '',
  precision: 3,
});

export const emptySection = (): SectionForm => ({
  _key: uid(),
  sectionId: '',
  sectionName: '',
  shuffleQuestions: false,
  questions: [],
});

export const defaultForm = (): ExamFormState => ({
  examCode: '',
  examTitle: '',
  jobDescription: '',
  durationMinutes: 60,
  canNavigate: true,
  submissionType: 'complete',
  maxViolations: 5,
  cameraRecording: true,
  screenRecording: true,
  cameraPip: false,
  grading: DEFAULT_GRADING,
  showStudentName: true,
  showExamCode: true,
  showScore: true,
  showTotalMarks: true,
  showGrade: true,
  showPerformanceSummary: true,
  showPdfDownload: false,
  showRetakeButton: true,
  pdfMode: 'detailed',
  sections: [],
});

export function formToJson(f: ExamFormState): object {
  let qCounter = 1;
  return {
    examCode: f.examCode.toUpperCase(),
    examTitle: f.examTitle,
    jobDescription: f.jobDescription,
    duration: f.durationMinutes * 60,
    canNavigate: f.canNavigate,
    submissionType: f.submissionType,
    maxViolations: f.maxViolations,
    recording: { camera: f.cameraRecording, screen: f.screenRecording, ...(f.cameraPip ? { cameraPip: true } : {}) },
    grading: f.grading,
    resultDisplay: {
      showStudentName: f.showStudentName,
      showExamCode: f.showExamCode,
      showScore: f.showScore,
      showTotalMarks: f.showTotalMarks,
      showGrade: f.showGrade,
      showPerformanceSummary: f.showPerformanceSummary,
      showPdfDownload: f.showPdfDownload,
      showRetakeButton: f.showRetakeButton,
      pdfMode: f.pdfMode,
    },
    sections: f.sections.map(s => ({
      sectionId: s.sectionId,
      sectionName: s.sectionName,
      shuffleQuestions: s.shuffleQuestions,
      questions: s.questions.map(q => {
        const base = {
          id: `q${qCounter}`,
          number: qCounter++,
          type: q.type,
          question: q.question,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          timeLimit: q.timeLimit !== '' ? Number(q.timeLimit) : null,
          correctAnswer: q.correctAnswer,
        };
        if (q.type === 'mcq') {
          return {
            ...base,
            multipleChoice: q.multipleChoice,
            shuffleOptions: q.shuffleOptions,
            options: q.options
              .filter(o => o.text.trim() !== '')
              .map((o, i) => ({
                id: o.id || String.fromCharCode(97 + i),
                text: o.text,
                type: o.isImage ? 'image' : 'text',
              })),
          };
        }
        if (q.type === 'verbal') {
          return {
            ...base,
            maxDuration:    q.maxDuration !== '' ? Number(q.maxDuration) : 60,
            autoStartDelay: q.autoStartDelay !== '' ? Number(q.autoStartDelay) : 0,
            allowRerecord:  q.allowRerecord,
            expectedReply:  q.expectedReply,
            precision:      q.precision,
          };
        }
        return base;
      }),
    })),
  };
}

export function jsonToForm(raw: string): ExamFormState {
  const j = JSON.parse(raw);
  return {
    examCode: j.examCode ?? '',
    examTitle: j.examTitle ?? '',
    jobDescription: j.jobDescription ?? '',
    durationMinutes: Math.floor((j.duration ?? 3600) / 60),
    canNavigate: j.canNavigate ?? true,
    submissionType: j.submissionType ?? 'complete',
    maxViolations: j.maxViolations ?? 5,
    cameraRecording: j.recording?.camera ?? false,
    screenRecording: j.recording?.screen ?? false,
    cameraPip: j.recording?.cameraPip ?? false,
    grading: j.grading ?? DEFAULT_GRADING,
    showStudentName: j.resultDisplay?.showStudentName ?? true,
    showExamCode: j.resultDisplay?.showExamCode ?? true,
    showScore: j.resultDisplay?.showScore ?? true,
    showTotalMarks: j.resultDisplay?.showTotalMarks ?? true,
    showGrade: j.resultDisplay?.showGrade ?? true,
    showPerformanceSummary: j.resultDisplay?.showPerformanceSummary ?? true,
    showPdfDownload: j.resultDisplay?.showPdfDownload ?? false,
    showRetakeButton: j.resultDisplay?.showRetakeButton ?? true,
    pdfMode: j.resultDisplay?.pdfMode ?? 'detailed',
    sections: (j.sections ?? []).map((s: any) => ({
      _key: uid(),
      sectionId: s.sectionId ?? '',
      sectionName: s.sectionName ?? '',
      shuffleQuestions: s.shuffleQuestions ?? false,
      questions: (s.questions ?? []).map((q: any) => ({
        _key: uid(),
        type: q.type ?? 'mcq',
        question: q.question ?? '',
        multipleChoice: q.multipleChoice ?? false,
        shuffleOptions: q.shuffleOptions ?? false,
        options: (q.options ?? []).map((o: any) => ({
          id: o.id,
          text: o.text ?? '',
          isImage: o.type === 'image',
        })),
        correctAnswer: q.correctAnswer ?? [],
        marks: q.marks ?? 1,
        negativeMarks: q.negativeMarks ?? 0,
        timeLimit: q.timeLimit != null ? String(q.timeLimit) : '',
        maxDuration:    q.maxDuration != null ? String(q.maxDuration) : '60',
        autoStartDelay: q.autoStartDelay != null ? String(q.autoStartDelay) : '0',
        allowRerecord:  q.allowRerecord ?? false,
        expectedReply:  q.expectedReply ?? '',
        precision:      q.precision ?? 3,
      })),
    })),
  };
}
