import { useEffect, useState } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { adminApi, ExamRow } from './adminApi';
import { useEscapeKey } from './useEscapeKey';

interface Props {
  creds: string;
}

interface ParsedExam {
  examCode: string;
  examTitle: string;
  jobDescription?: string;
  duration: number;
  canNavigate: boolean;
  submissionType: string;
  maxViolations: number;
  recording: { camera: boolean; screen: boolean };
  grading: { grade: string; minPercentage: number }[];
  resultDisplay: Record<string, boolean | string>;
  sections: ParsedSection[];
}

interface ParsedSection {
  sectionId: string;
  sectionName: string;
  shuffleQuestions: boolean;
  questions: ParsedQuestion[];
}

interface ParsedQuestion {
  id: string;
  number: number;
  type: 'mcq' | 'subjective' | 'verbal';
  question: string;
  marks: number;
  negativeMarks: number;
  timeLimit: number | null;
  correctAnswer: string[];
  // mcq
  multipleChoice?: boolean;
  shuffleOptions?: boolean;
  options?: { id: string; text: string; type: string }[];
  // subjective / verbal
  expectedReply?: string;
  precision?: number;
  // verbal
  maxDuration?: number;
  autoStartDelay?: number;
  allowRerecord?: boolean;
}

export default function ExamDetailPage({ creds }: Props) {
  const { examCode } = useParams<{ examCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamRow | null>(
    (location.state as { exam?: ExamRow })?.exam ?? null,
  );
  const [error, setError] = useState('');

  // Escape = go back to the admin exam list.
  useEscapeKey(() => navigate('/adm'));

  useEffect(() => {
    if (exam) return;
    adminApi.list(creds).then(list => {
      const found = list.find(e => e.examCode === examCode);
      if (found) setExam(found);
      else setError('Exam not found.');
    }).catch(() => setError('Failed to load exam data.'));
  }, [creds, exam, examCode]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error}</p>
        <Link to="/adm" className="text-sm text-slate-600 hover:underline">← Back to Exams</Link>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  let parsed: ParsedExam | null = null;
  try { parsed = JSON.parse(exam.examData); } catch { /* show raw below */ }

  const fmtDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const typeBadge = (type: string) => {
    const styles: Record<string, string> = {
      mcq: 'bg-blue-100 text-blue-700',
      subjective: 'bg-purple-100 text-purple-700',
      verbal: 'bg-amber-100 text-amber-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${styles[type] ?? 'bg-gray-100 text-gray-600'}`}>
        {type}
      </span>
    );
  };

  const totalQuestions = parsed?.sections.reduce((s, sec) => s + sec.questions.length, 0) ?? 0;
  const totalMarks = parsed?.sections.reduce((s, sec) =>
    s + sec.questions.reduce((qs, q) => qs + q.marks, 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4 flex items-center gap-4">
        <Link
          to="/adm"
          className="text-slate-300 hover:text-white transition text-sm flex items-center gap-1"
        >
          ← Back
        </Link>
        <div className="flex-1 flex items-center gap-3">
          <span className="font-mono font-bold text-lg">{exam.examCode}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-200">{exam.examTitle}</span>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          exam.active ? 'bg-green-500 text-white' : 'bg-slate-600 text-slate-300'
        }`}>
          {exam.active ? 'Active' : 'Inactive'}
        </span>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">

        {!parsed ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-red-500 mb-2">Could not parse exam data — showing raw JSON:</p>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all">{exam.examData}</pre>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Duration', value: fmtDuration(parsed.duration) },
                { label: 'Sections', value: parsed.sections.length },
                { label: 'Questions', value: totalQuestions },
                { label: 'Total Marks', value: totalMarks },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Settings */}
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-700 text-sm">Exam Settings</h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Row label="Submission type" value={parsed.submissionType} />
                <Row label="Can navigate" value={parsed.canNavigate ? 'Yes' : 'No'} />
                <Row label="Max violations" value={String(parsed.maxViolations)} />
                <Row label="Camera recording" value={parsed.recording.camera ? 'On' : 'Off'} />
                <Row label="Screen recording" value={parsed.recording.screen ? 'On' : 'Off'} />
                {parsed.jobDescription && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-500">Job description: </span>
                    <span className="text-gray-800">{parsed.jobDescription}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Grading */}
            {parsed.grading?.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <h3 className="font-semibold text-gray-700 text-sm">Grading</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">Grade</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">Min %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {parsed.grading.map((g, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-semibold text-gray-800">{g.grade}</td>
                          <td className="px-4 py-2 text-gray-600">{g.minPercentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Result display settings */}
            {parsed.resultDisplay && (
              <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <h3 className="font-semibold text-gray-700 text-sm">Result Display</h3>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  {Object.entries(parsed.resultDisplay).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className={`w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center text-xs ${
                        val === true ? 'bg-green-100 text-green-600' : val === false ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {val === true ? '✓' : val === false ? '✕' : '·'}
                      </span>
                      <span className="text-gray-600 capitalize">{camelToLabel(key)}</span>
                      {typeof val === 'string' && <span className="text-gray-400 text-xs">({val})</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sections + Questions */}
            <div className="space-y-4">
              {parsed.sections.map((section, si) => (
                <section key={section.sectionId || si} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800 text-white flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{section.sectionName || `Section ${si + 1}`}</span>
                      {section.sectionId && (
                        <span className="ml-2 font-mono text-slate-400 text-xs">{section.sectionId}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {section.shuffleQuestions && <span>Shuffle</span>}
                      <span>{section.questions.length} question{section.questions.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {section.questions.map((q, qi) => (
                      <div key={q.id || qi} className="p-4">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 w-7 h-7 flex-shrink-0 bg-slate-100 rounded-full text-xs font-bold text-slate-600 flex items-center justify-center">
                            {q.number ?? qi + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              {typeBadge(q.type)}
                              <span className="text-xs text-gray-500">{q.marks} mark{q.marks !== 1 ? 's' : ''}{q.negativeMarks > 0 ? ` / −${q.negativeMarks}` : ''}</span>
                              {q.timeLimit != null && (
                                <span className="text-xs text-gray-400">{q.timeLimit}s limit</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{q.question}</p>

                            {/* MCQ options */}
                            {q.type === 'mcq' && q.options && q.options.length > 0 && (
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {q.options.map(opt => {
                                  const isCorrect = q.correctAnswer?.includes(opt.id);
                                  return (
                                    <div key={opt.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                                      isCorrect ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-gray-50 text-gray-700'
                                    }`}>
                                      <span className="font-mono text-xs font-bold text-gray-400 w-4">{opt.id.toUpperCase()}.</span>
                                      {opt.type === 'image'
                                        ? <span className="italic text-gray-400 text-xs">[image] {opt.text}</span>
                                        : <span>{opt.text}</span>
                                      }
                                      {isCorrect && <span className="ml-auto text-green-500 text-xs">✓</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Subjective */}
                            {q.type === 'subjective' && (
                              <div className="mt-2 space-y-1 text-xs text-gray-500">
                                {q.expectedReply && (
                                  <p><span className="font-medium text-gray-600">Expected reply:</span> {q.expectedReply}</p>
                                )}
                                {q.precision != null && (
                                  <p><span className="font-medium text-gray-600">Precision:</span> {q.precision}/5</p>
                                )}
                              </div>
                            )}

                            {/* Verbal */}
                            {q.type === 'verbal' && (
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                                {q.maxDuration != null && <span>Max {q.maxDuration}s</span>}
                                {q.autoStartDelay != null && q.autoStartDelay > 0 && <span>Auto-start after {q.autoStartDelay}s</span>}
                                {q.allowRerecord && <span className="text-amber-600">Re-record allowed</span>}
                                {q.precision != null && <span>Precision {q.precision}/5</span>}
                                {q.expectedReply && (
                                  <p className="w-full"><span className="font-medium text-gray-600">Expected reply:</span> {q.expectedReply}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 min-w-[130px]">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function camelToLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}