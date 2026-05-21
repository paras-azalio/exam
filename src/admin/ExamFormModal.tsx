import { useState } from 'react';
import {
  ExamFormState, SectionForm, QuestionForm, OptionForm, GradeForm,
  emptyQuestion, emptySection, formToJson,
} from './types';

interface Props {
  initial: ExamFormState;
  active: boolean;
  onActiveChange: (v: boolean) => void;
  onSave: (examDataJson: string, active: boolean) => Promise<void>;
  onCancel: () => void;
  title: string;
}

// ── tiny helpers ──────────────────────────────────────────────────────────────
const Input = (p: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="block">
    <span className="text-xs font-medium text-gray-600 mb-0.5 block">{p.label}</span>
    <input {...p} label={undefined}
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none" />
  </label>
);

const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
      className="w-4 h-4 accent-slate-700" />
    {label}
  </label>
);

const optionLetter = (i: number) => String.fromCharCode(97 + i);

export default function ExamFormModal({ initial, active, onActiveChange, onSave, onCancel, title }: Props) {
  const [f, setF] = useState<ExamFormState>(initial);
  const [activeState, setActiveStateLocal] = useState(active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  const set = (patch: Partial<ExamFormState>) => setF(p => ({ ...p, ...patch }));

  // ── validation ───────────────────────────────────────────────────────────────
  const validate = (): string => {
    if (!f.examCode.trim()) return 'Exam code is required.';
    if (!f.examTitle.trim()) return 'Exam title is required.';
    if (f.durationMinutes <= 0) return 'Duration must be > 0.';
    if (f.sections.length === 0) return 'Add at least one section.';
    for (const s of f.sections) {
      if (!s.sectionId.trim() || !s.sectionName.trim()) return 'All sections need an ID and name.';
      if (s.questions.length === 0) return `Section "${s.sectionName}" has no questions.`;
      for (const q of s.questions) {
        if (!q.question.trim()) return 'All questions must have text.';
        if (q.type === 'mcq') {
          const filled = q.options.filter(o => o.text.trim());
          if (filled.length < 2) return 'MCQ questions need at least 2 options.';
          if (q.correctAnswer.length === 0) return 'Mark at least one correct answer per MCQ question.';
        } else if (q.type === 'subjective') {
          if (q.correctAnswer.length === 0 || !q.correctAnswer[0]?.trim())
            return 'Subjective questions need at least one acceptable answer.';
        } else if (q.type === 'verbal') {
          if (!q.maxDuration || Number(q.maxDuration) <= 0)
            return 'Verbal questions need a recording duration > 0.';
          if (!q.expectedReply.trim())
            return 'Verbal questions need an expected reply for evaluation.';
        }
      }
    }
    return '';
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);
    try {
      await onSave(JSON.stringify(formToJson(f)), activeState);
    } catch (e: any) {
      setError(e.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── section helpers ───────────────────────────────────────────────────────────
  const toggleSection = (key: string) =>
    setExpandedSections(p => ({ ...p, [key]: !p[key] }));

  const toggleQuestion = (key: string) =>
    setExpandedQuestions(p => ({ ...p, [key]: !p[key] }));

  const updateSection = (key: string, patch: Partial<SectionForm>) =>
    setF(p => ({ ...p, sections: p.sections.map(s => s._key === key ? { ...s, ...patch } : s) }));

  const removeSection = (key: string) =>
    setF(p => ({ ...p, sections: p.sections.filter(s => s._key !== key) }));

  const addSection = () => {
    const s = emptySection();
    setF(p => ({ ...p, sections: [...p.sections, s] }));
    setExpandedSections(p => ({ ...p, [s._key]: true }));
  };

  // ── question helpers ──────────────────────────────────────────────────────────
  const updateQuestion = (sKey: string, qKey: string, patch: Partial<QuestionForm>) =>
    updateSection(sKey, {
      questions: f.sections.find(s => s._key === sKey)!.questions
        .map(q => q._key === qKey ? { ...q, ...patch } : q),
    });

  const removeQuestion = (sKey: string, qKey: string) =>
    updateSection(sKey, {
      questions: f.sections.find(s => s._key === sKey)!.questions.filter(q => q._key !== qKey),
    });

  const addQuestion = (sKey: string) => {
    const q = emptyQuestion();
    updateSection(sKey, {
      questions: [...f.sections.find(s => s._key === sKey)!.questions, q],
    });
    setExpandedQuestions(p => ({ ...p, [q._key]: true }));
  };

  // ── option helpers ────────────────────────────────────────────────────────────
  const updateOption = (sKey: string, qKey: string, idx: number, patch: Partial<OptionForm>) => {
    const section = f.sections.find(s => s._key === sKey)!;
    const question = section.questions.find(q => q._key === qKey)!;
    const opts = question.options.map((o, i) => i === idx ? { ...o, ...patch } : o);
    updateQuestion(sKey, qKey, { options: opts });
  };

  const addOption = (sKey: string, qKey: string) => {
    const section = f.sections.find(s => s._key === sKey)!;
    const question = section.questions.find(q => q._key === qKey)!;
    const idx = question.options.length;
    updateQuestion(sKey, qKey, {
      options: [...question.options, { id: optionLetter(idx), text: '', isImage: false }],
    });
  };

  const removeOption = (sKey: string, qKey: string, idx: number) => {
    const section = f.sections.find(s => s._key === sKey)!;
    const question = section.questions.find(q => q._key === qKey)!;
    const removedId = question.options[idx].id;
    const opts = question.options.filter((_, i) => i !== idx)
      .map((o, i) => ({ ...o, id: optionLetter(i) }));
    updateQuestion(sKey, qKey, {
      options: opts,
      correctAnswer: question.correctAnswer.filter(id => id !== removedId),
    });
  };

  const toggleCorrect = (sKey: string, qKey: string, id: string, multi: boolean) => {
    const q = f.sections.find(s => s._key === sKey)!.questions.find(q => q._key === qKey)!;
    let ca: string[];
    if (multi) {
      ca = q.correctAnswer.includes(id)
        ? q.correctAnswer.filter(x => x !== id)
        : [...q.correctAnswer, id];
    } else {
      ca = [id];
    }
    updateQuestion(sKey, qKey, { correctAnswer: ca });
  };

  // ── grading helpers ───────────────────────────────────────────────────────────
  const updateGrade = (i: number, patch: Partial<GradeForm>) =>
    set({ grading: f.grading.map((g, idx) => idx === i ? { ...g, ...patch } : g) });

  const addGrade = () => set({ grading: [...f.grading, { grade: '', minPercentage: 0 }] });

  const removeGrade = (i: number) =>
    set({ grading: f.grading.filter((_, idx) => idx !== i) });

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl flex flex-col max-h-[95vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Basic Info ── */}
          <Section title="Exam Info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Exam Code" value={f.examCode}
                onChange={e => set({ examCode: e.target.value.toUpperCase() })} placeholder="EXAM001" />
              <Input label="Exam Title" value={f.examTitle}
                onChange={e => set({ examTitle: e.target.value })} placeholder="Mathematics Paper 1" />
              <Input label="Duration (minutes)" type="number" min={1} value={f.durationMinutes}
                onChange={e => set({ durationMinutes: Number(e.target.value) })} />
              <Input label="Max Violations" type="number" min={1} value={f.maxViolations}
                onChange={e => set({ maxViolations: Number(e.target.value) })} />
            </div>
            <div className="mt-3">
              <span className="text-xs font-medium text-gray-600 block mb-1">
                Job Description
                <span className="ml-1 text-gray-400 font-normal">(shown to candidate before exam starts via invite link)</span>
              </span>
              <textarea
                value={f.jobDescription}
                onChange={e => set({ jobDescription: e.target.value })}
                rows={4}
                placeholder="Describe the role, responsibilities, required skills…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-400 resize-y"
              />
            </div>
            <div className="flex gap-4 flex-wrap mt-2">
              <Check label="Can Navigate (back/forward)" checked={f.canNavigate} onChange={v => set({ canNavigate: v })} />
              <Check label="Active (visible to students)" checked={activeState} onChange={v => { setActiveStateLocal(v); onActiveChange(v); }} />
            </div>
          </Section>

          {/* ── Recording ── */}
          <Section title="Recording">
            <div className="flex gap-6">
              <Check label="Camera & Microphone" checked={f.cameraRecording} onChange={v => set({ cameraRecording: v })} />
              <Check label="Screen Recording" checked={f.screenRecording} onChange={v => set({ screenRecording: v })} />
            </div>
          </Section>

          {/* ── Grading ── */}
          <Section title="Grading">
            <div className="space-y-2">
              {f.grading.map((g, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={g.grade} onChange={e => updateGrade(i, { grade: e.target.value })}
                    placeholder="Grade (A)" maxLength={3}
                    className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-400" />
                  <input type="number" value={g.minPercentage} min={0} max={100}
                    onChange={e => updateGrade(i, { minPercentage: Number(e.target.value) })}
                    className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-400" />
                  <span className="text-xs text-gray-400">% min</span>
                  <button onClick={() => removeGrade(i)} className="text-red-400 hover:text-red-600 text-sm ml-1">✕</button>
                </div>
              ))}
              <button onClick={addGrade}
                className="text-xs text-slate-600 hover:text-slate-800 border border-dashed border-gray-300 rounded px-3 py-1">
                + Add Grade
              </button>
            </div>
          </Section>

          {/* ── Result Display ── */}
          <Section title="Result Display">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Check label="Show Student Name" checked={f.showStudentName} onChange={v => set({ showStudentName: v })} />
              <Check label="Show Exam Code" checked={f.showExamCode} onChange={v => set({ showExamCode: v })} />
              <Check label="Show Score" checked={f.showScore} onChange={v => set({ showScore: v })} />
              <Check label="Show Total Marks" checked={f.showTotalMarks} onChange={v => set({ showTotalMarks: v })} />
              <Check label="Show Grade" checked={f.showGrade} onChange={v => set({ showGrade: v })} />
              <Check label="Show Performance Summary" checked={f.showPerformanceSummary} onChange={v => set({ showPerformanceSummary: v })} />
              <Check label="Show PDF Download" checked={f.showPdfDownload} onChange={v => set({ showPdfDownload: v })} />
              <Check label="Show Retake Button" checked={f.showRetakeButton} onChange={v => set({ showRetakeButton: v })} />
            </div>
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-600 mr-2">PDF Mode:</span>
              {(['marks-only', 'summary', 'detailed'] as const).map(m => (
                <label key={m} className="mr-4 text-sm cursor-pointer">
                  <input type="radio" name="pdfMode" value={m} checked={f.pdfMode === m}
                    onChange={() => set({ pdfMode: m })} className="mr-1 accent-slate-700" />
                  {m}
                </label>
              ))}
            </div>
          </Section>

          {/* ── Sections & Questions ── */}
          <Section title={`Sections & Questions (${f.sections.reduce((a, s) => a + s.questions.length, 0)} questions)`}>
            <div className="space-y-3">
              {f.sections.map((sec, si) => (
                <div key={sec._key} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Section header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <button onClick={() => toggleSection(sec._key)}
                      className="text-gray-400 hover:text-gray-600 w-5 text-center text-sm">
                      {expandedSections[sec._key] ? '▾' : '▸'}
                    </button>
                    <input value={sec.sectionId} onChange={e => updateSection(sec._key, { sectionId: e.target.value })}
                      placeholder="ID (A)" maxLength={10}
                      className="w-16 px-2 py-1 text-xs border border-gray-300 rounded outline-none" />
                    <input value={sec.sectionName} onChange={e => updateSection(sec._key, { sectionName: e.target.value })}
                      placeholder="Section Name"
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded outline-none" />
                    <Check label="Shuffle" checked={sec.shuffleQuestions}
                      onChange={v => updateSection(sec._key, { shuffleQuestions: v })} />
                    <span className="text-xs text-gray-400 ml-1">{sec.questions.length}Q</span>
                    <button onClick={() => removeSection(sec._key)}
                      className="text-red-400 hover:text-red-600 text-sm ml-1">✕</button>
                  </div>

                  {/* Questions */}
                  {expandedSections[sec._key] && (
                    <div className="p-3 space-y-2">
                      {sec.questions.map((q, qi) => (
                        <QuestionCard key={q._key} q={q} index={qi}
                          sKey={sec._key}
                          expanded={!!expandedQuestions[q._key]}
                          onToggle={() => toggleQuestion(q._key)}
                          onUpdate={patch => updateQuestion(sec._key, q._key, patch)}
                          onRemove={() => removeQuestion(sec._key, q._key)}
                          onUpdateOption={(idx, patch) => updateOption(sec._key, q._key, idx, patch)}
                          onAddOption={() => addOption(sec._key, q._key)}
                          onRemoveOption={idx => removeOption(sec._key, q._key, idx)}
                          onToggleCorrect={(id, multi) => toggleCorrect(sec._key, q._key, id, multi)}
                        />
                      ))}
                      <button onClick={() => addQuestion(sec._key)}
                        className="w-full py-2 text-xs text-slate-600 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition">
                        + Add Question to {sec.sectionName || `Section ${si + 1}`}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={addSection}
                className="w-full py-2.5 text-sm text-slate-700 border border-dashed border-slate-400 rounded-xl hover:bg-slate-50 transition font-medium">
                + Add Section
              </button>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 flex items-center justify-between">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : <span />}
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Exam'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b border-gray-100">{title}</h4>
      {children}
    </div>
  );
}

// ── Question card ──────────────────────────────────────────────────────────────
interface QCardProps {
  q: QuestionForm;
  index: number;
  sKey: string;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (p: Partial<QuestionForm>) => void;
  onRemove: () => void;
  onUpdateOption: (idx: number, p: Partial<OptionForm>) => void;
  onAddOption: () => void;
  onRemoveOption: (idx: number) => void;
  onToggleCorrect: (id: string, multi: boolean) => void;
}

function QuestionCard({ q, index, expanded, onToggle, onUpdate, onRemove, onUpdateOption, onAddOption, onRemoveOption, onToggleCorrect }: QCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <span className="text-gray-400 text-xs w-4">{expanded ? '▾' : '▸'}</span>
        <span className="text-xs font-semibold text-gray-500 w-6">Q{index + 1}</span>
        <span className="flex-1 text-sm text-gray-700 truncate">{q.question || <em className="text-gray-400">No text yet</em>}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          q.type === 'mcq' ? 'bg-blue-50 text-blue-600'
          : q.type === 'verbal' ? 'bg-orange-50 text-orange-600'
          : 'bg-purple-50 text-purple-600'}`}>
          {q.type === 'mcq' ? (q.multipleChoice ? 'MCQ-M' : 'MCQ') : q.type === 'verbal' ? 'VERBAL' : 'SUB'}
        </span>
        <span className="text-xs text-gray-400">{q.marks}M</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 py-4 border-t border-gray-100 space-y-4 bg-gray-50">
          {/* Type selector */}
          <div className="flex gap-4 items-center flex-wrap">
            <span className="text-xs font-medium text-gray-600">Type:</span>
            {(['mcq', 'subjective', 'verbal'] as const).map(t => (
              <label key={t} className="text-sm cursor-pointer">
                <input type="radio" name={`type_${q._key}`} value={t} checked={q.type === t}
                  onChange={() => onUpdate({ type: t, correctAnswer: [] })}
                  className="mr-1 accent-slate-700" />
                {t === 'mcq' ? 'Multiple Choice' : t === 'subjective' ? 'Subjective' : 'Verbal'}
              </label>
            ))}
          </div>

          {/* Question text */}
          <div>
            <span className="text-xs font-medium text-gray-600 block mb-1">Question Text</span>
            <textarea value={q.question} onChange={e => onUpdate({ question: e.target.value })}
              rows={2} placeholder="Enter question text…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-400 resize-none" />
          </div>

          {/* Marks row */}
          <div className="flex gap-3 flex-wrap">
            <label className="block">
              <span className="text-xs font-medium text-gray-600 block mb-0.5">Marks</span>
              <input type="number" value={q.marks} min={0} step={0.5}
                onChange={e => onUpdate({ marks: Number(e.target.value) })}
                className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 block mb-0.5">Negative Marks</span>
              <input type="number" value={q.negativeMarks} min={0} step={0.25}
                onChange={e => onUpdate({ negativeMarks: Number(e.target.value) })}
                className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 block mb-0.5">Time Limit (sec)</span>
              <input type="number" value={q.timeLimit} min={0} placeholder="none"
                onChange={e => onUpdate({ timeLimit: e.target.value })}
                className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none" />
            </label>
          </div>

          {/* MCQ options */}
          {q.type === 'mcq' && (
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-xs font-medium text-gray-600">Options & Correct Answer</span>
                <div className="flex items-center gap-4">
                  <Check label="Shuffle options" checked={q.shuffleOptions}
                    onChange={v => onUpdate({ shuffleOptions: v })} />
                  <Check label="Multiple correct" checked={q.multipleChoice}
                    onChange={v => onUpdate({ multipleChoice: v, correctAnswer: [] })} />
                </div>
              </div>
              <div className="space-y-1.5">
                {q.options.map((opt, i) => {
                  const isCorrect = q.correctAnswer.includes(opt.id);
                  return (
                    <div key={i} className="flex gap-2 items-center">
                      {q.multipleChoice ? (
                        <input type="checkbox" checked={isCorrect}
                          onChange={() => onToggleCorrect(opt.id, true)}
                          className="w-4 h-4 accent-green-600 flex-shrink-0" />
                      ) : (
                        <input type="radio" name={`correct_${q._key}`} checked={isCorrect}
                          onChange={() => onToggleCorrect(opt.id, false)}
                          className="w-4 h-4 accent-green-600 flex-shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-gray-500 w-5 uppercase">{opt.id}.</span>
                      <input value={opt.text} onChange={e => onUpdateOption(i, { text: e.target.value })}
                        placeholder={`Option ${opt.id.toUpperCase()}`}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded outline-none focus:ring-1 focus:ring-slate-400" />
                      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={opt.isImage}
                          onChange={e => onUpdateOption(i, { isImage: e.target.checked })}
                          className="accent-slate-600" />
                        img
                      </label>
                      {q.options.length > 2 && (
                        <button onClick={() => onRemoveOption(i)}
                          className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      )}
                    </div>
                  );
                })}
                <button onClick={onAddOption}
                  className="text-xs text-slate-600 border border-dashed border-gray-300 rounded px-3 py-1 hover:bg-white transition">
                  + Option
                </button>
              </div>
            </div>
          )}

          {/* Verbal settings */}
          {q.type === 'verbal' && (
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 block mb-0.5">Recording Duration (sec)</span>
                  <input type="number" value={q.maxDuration} min={5} placeholder="60"
                    onChange={e => onUpdate({ maxDuration: e.target.value })}
                    className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 block mb-0.5">Auto-Start Delay (sec)</span>
                  <input type="number" value={q.autoStartDelay} min={0} placeholder="0 = manual"
                    onChange={e => onUpdate({ autoStartDelay: e.target.value })}
                    className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none" />
                  <span className="text-xs text-gray-400 block mt-0.5">0 = manual start only</span>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 block mb-0.5">AI Precision level (1–5)</span>
                  <input type="number" value={q.precision} min={1} max={5}
                    onChange={e => onUpdate({ precision: Math.min(5, Math.max(1, Number(e.target.value))) })}
                    className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none" />
                  <span className="text-xs text-gray-400 block mt-0.5">1 lenient → 5 strict</span>
                </label>
                <label className="block self-start pt-1">
                  <span className="text-xs font-medium text-gray-600 block mb-1.5">Allow Re-record</span>
                  <button
                    type="button"
                    onClick={() => onUpdate({ allowRerecord: !q.allowRerecord })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      q.allowRerecord ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      q.allowRerecord ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <span className="text-xs text-gray-400 block mt-0.5">
                    {q.allowRerecord ? 'Manual submit' : 'Auto-upload'}
                  </span>
                </label>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-600 block mb-1">
                  Expected Reply
                  <span className="ml-1 text-gray-400 font-normal">(For referencing purpose)</span>
                </span>
                <textarea value={q.expectedReply}
                  onChange={e => onUpdate({ expectedReply: e.target.value })}
                  rows={3} placeholder="Describe the ideal answer the AI should evaluate against…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-400 resize-none" />
              </div>
            </div>
          )}

          {/* Subjective answers */}
          {q.type === 'subjective' && (
            <div>
              <span className="text-xs font-medium text-gray-600 block mb-2">Acceptable Answers</span>
              <div className="space-y-1.5">
                {(q.correctAnswer.length === 0 ? [''] : q.correctAnswer).map((ans, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={ans} placeholder="Acceptable answer…"
                      onChange={e => {
                        const updated = [...(q.correctAnswer.length === 0 ? [''] : q.correctAnswer)];
                        updated[i] = e.target.value;
                        onUpdate({ correctAnswer: updated.filter((_, j) => j !== i || e.target.value !== '') });
                        if (e.target.value !== '' && !q.correctAnswer[i]) {
                          onUpdate({ correctAnswer: updated });
                        }
                      }}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-400" />
                    {q.correctAnswer.length > 1 && (
                      <button onClick={() => onUpdate({ correctAnswer: q.correctAnswer.filter((_, j) => j !== i) })}
                        className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => onUpdate({ correctAnswer: [...q.correctAnswer, ''] })}
                  className="text-xs text-slate-600 border border-dashed border-gray-300 rounded px-3 py-1 hover:bg-white transition">
                  + Alternate Answer
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
