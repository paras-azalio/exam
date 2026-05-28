import { ExamData } from '../types/exam';

/** verbalScores: questionId → { score, maxMarks } — passed by admin when AI results are available */
export const generatePDF = (
  examData: ExamData,
  candidateName: string,
  score: number,
  totalMarks: number,
  details: any[],
  pdfMode: 'marks-only' | 'summary' | 'detailed' = 'summary',
  verbalScores?: Record<string, { score: number | null; maxMarks: number | null }>
) => {
  const printWindow = window.open('', '', 'height=900,width=900');
  if (!printWindow) return;

  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

  // ── Shared header ────────────────────────────────────────────────────────────
  const headerHTML = `
    <div class="header">
      <h1>${examData.examTitle}</h1>
      <p>Exam Code: ${examData.examCode}</p>
    </div>
    <div class="info">
      <div class="info-row"><strong>Candidate Name:</strong><span>${candidateName}</span></div>
      <div class="info-row"><strong>Date:</strong><span>${new Date().toLocaleString()}</span></div>
    </div>
    <div class="score-box">
      <h2>Final Score: ${score.toFixed(2)} / ${totalMarks}</h2>
      <p>Percentage: ${percentage.toFixed(2)}%</p>
    </div>
  `;

  // ── Mode-specific body ───────────────────────────────────────────────────────
  let bodyHTML = '';

  if (pdfMode === 'marks-only') {
    bodyHTML = '';

  } else if (pdfMode === 'summary') {
    bodyHTML = `
      <table class="questions-table">
        <thead>
          <tr>
            <th>Question No.</th>
            <th>Status</th>
            <th>Marks Awarded</th>
            <th>Total Marks</th>
          </tr>
        </thead>
        <tbody>
          ${details
            .map((d) => {
              if (d.questionType === 'verbal') {
                const vs = verbalScores?.[d.questionId];
                const awarded = vs?.score != null ? `${vs.score.toFixed(2)}` : '— (Pending AI)';
                const max     = vs?.maxMarks ?? d.totalMarks;
                return `
                <tr>
                  <td>Question ${d.questionNumber}</td>
                  <td class="verbal">🎤 Verbal</td>
                  <td>${awarded}</td>
                  <td>${max}</td>
                </tr>`;
              }
              return `
              <tr>
                <td>Question ${d.questionNumber}</td>
                <td class="${d.correct ? 'correct' : 'incorrect'}">
                  ${d.correct ? '✓ Correct' : '✗ Incorrect'}
                </td>
                <td>${d.marksAwarded >= 0 ? '+' : ''}${d.marksAwarded.toFixed(2)}</td>
                <td>${d.totalMarks}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `;

  } else {
    // pdfMode === 'detailed'
    bodyHTML = details
      .map((d) => {
        if (d.questionType === 'verbal') {
          const vs      = verbalScores?.[d.questionId];
          const awarded = vs?.score != null ? `${vs.score.toFixed(2)}` : '— (Pending AI evaluation)';
          const max     = vs?.maxMarks ?? d.totalMarks;
          return `
            <div class="q-block verbal-block">
              <div class="q-header">
                <span class="q-num">Question ${d.questionNumber}</span>
                <span class="verbal">🎤 Verbal</span>
                <span class="q-marks">${awarded} / ${max}</span>
              </div>
              <p class="q-text">${d.questionText}</p>
              <div class="subj-answers">
                <div>${vs?.score != null
                  ? `AI Score: <strong>${vs.score.toFixed(2)} / ${max}</strong>`
                  : 'Verbal answer was recorded. Score will be assigned after AI evaluation.'}</div>
              </div>
            </div>`;
        }

        let optionsHTML = '';

        if (d.questionType === 'mcq' && Array.isArray(d.options)) {
          const userSel: string[] = d.userAnswer
            ? Array.isArray(d.userAnswer) ? d.userAnswer : [d.userAnswer]
            : [];
          const correct: string[] = Array.isArray(d.correctAnswer)
            ? d.correctAnswer : [d.correctAnswer];

          const optionRows = d.options
            .map((opt: any) => {
              const isCorrect  = correct.includes(opt.id);
              const isSelected = userSel.includes(opt.id);
              let cls = 'option', marker = '○';
              if (isCorrect && isSelected)  { cls += ' opt-correct-selected'; marker = '✓'; }
              else if (isCorrect)           { cls += ' opt-correct';          marker = '✓'; }
              else if (isSelected)          { cls += ' opt-wrong-selected';   marker = '✗'; }
              const label = opt.type === 'image'
                ? `<em>[Image option ${opt.id.toUpperCase()}]</em>` : opt.text;
              return `<div class="${cls}">${marker} (${opt.id.toUpperCase()}) ${label}</div>`;
            })
            .join('');
          optionsHTML = `<div class="options">${optionRows}</div>`;

        } else if (d.questionType === 'subjective') {
          const userAns = d.userAnswer
            ? Array.isArray(d.userAnswer) ? d.userAnswer[0] : d.userAnswer
            : '<em>(Not answered)</em>';
          const correctAns = Array.isArray(d.correctAnswer)
            ? d.correctAnswer.join(' / ') : d.correctAnswer;
          optionsHTML = `
            <div class="subj-answers">
              <div><strong>Your answer:</strong> ${userAns}</div>
              <div class="correct-hint"><strong>Correct answer:</strong> ${correctAns}</div>
            </div>`;
        }

        return `
          <div class="q-block">
            <div class="q-header">
              <span class="q-num">Question ${d.questionNumber}</span>
              <span class="${d.correct ? 'correct' : 'incorrect'}">
                ${d.correct ? '✓ Correct' : '✗ Incorrect'}
              </span>
              <span class="q-marks">${d.marksAwarded >= 0 ? '+' : ''}${d.marksAwarded.toFixed(2)} / ${d.totalMarks}</span>
            </div>
            <p class="q-text">${d.questionText}</p>
            ${optionsHTML}
          </div>`;
      })
      .join('');
  }

  printWindow.document.write(buildHtml(examData.examCode, candidateName, headerHTML, bodyHTML));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};

// ── Admin PDF: generated from ResultRow (has verbal AI scores, no per-question MCQ detail) ──
export interface AdminPDFVerbalRow {
  questionId:    string;
  question:      string;
  expectedReply?: string | null;
  aiScore:       number | null;
  maxMarks:      number | null;
  status:        string;
  transcript?:   string | null;
  feedback?:     string | null;
}

export const generateAdminPDF = (
  candidateName: string,
  examCode: string,
  mcqScore:     number | null,
  mcqMaxMarks:  number | null,
  totalScore:   number,
  totalMaxMarks: number,
  grade:        string | null,
  verbalRows:   AdminPDFVerbalRow[]
) => {
  const printWindow = window.open('', '', 'height=900,width=900');
  if (!printWindow) return;

  const totalPct = totalMaxMarks > 0 ? (totalScore / totalMaxMarks) * 100 : 0;

  const headerHTML = `
    <div class="header">
      <h1>Exam Result Report</h1>
      <p>Exam Code: ${examCode}</p>
    </div>
    <div class="info">
      <div class="info-row"><strong>Candidate Name:</strong><span>${candidateName}</span></div>
      <div class="info-row"><strong>Date:</strong><span>${new Date().toLocaleString()}</span></div>
      ${grade ? `<div class="info-row"><strong>Grade:</strong><span>${grade}</span></div>` : ''}
    </div>
    <div class="score-box">
      <h2>Total Score: ${totalScore.toFixed(2)} / ${totalMaxMarks}</h2>
      <p>Percentage: ${totalPct.toFixed(2)}%</p>
      ${mcqScore != null ? `<p style="margin-top:6px;font-size:14px;color:#555">MCQ / Subjective: ${mcqScore.toFixed(2)} / ${mcqMaxMarks ?? '?'}</p>` : ''}
    </div>
  `;

  let bodyHTML = '';

  if (verbalRows.length > 0) {
    const verbalTotal    = verbalRows.reduce((s, r) => s + (r.aiScore ?? 0), 0);
    const verbalMaxTotal = verbalRows.reduce((s, r) => s + (r.maxMarks ?? 0), 0);

    const rows = verbalRows.map((r, i) => {
      const statusCls = r.status === 'SUCCESS' ? 'correct' : r.status === 'FAILED' ? 'incorrect' : 'verbal';
      const scoreText = r.status === 'SUCCESS' && r.aiScore != null
        ? `${r.aiScore.toFixed(2)} / ${r.maxMarks ?? '?'}`
        : `— / ${r.maxMarks ?? '?'} (${r.status})`;
      return `
        <div class="q-block verbal-block">
          <div class="q-header">
            <span class="q-num">Verbal Q${i + 1}</span>
            <span class="${statusCls}">🎤 ${r.status}</span>
            <span class="q-marks">${scoreText}</span>
          </div>
          <p class="q-text">${r.question}</p>
          ${r.expectedReply ? `
          <div class="subj-answers" style="margin-bottom:8px">
            <div><strong>Expected Reply:</strong> ${r.expectedReply}</div>
          </div>` : ''}
          ${r.transcript ? `
          <div class="verbal-transcript">
            <div class="vt-label">🎤 Candidate's Answer (Transcript)</div>
            <div class="vt-text">"${r.transcript}"</div>
          </div>` : `
          <div class="verbal-transcript" style="color:#9ca3af;font-style:italic;font-size:13px">No transcript available</div>`}
          ${r.feedback ? `
          <div class="verbal-feedback">
            <div class="vf-label">💬 AI Feedback</div>
            <div class="vf-text">${r.feedback}</div>
          </div>` : ''}
        </div>`;
    }).join('');

    bodyHTML = `
      <div class="section-title">Verbal Questions</div>
      <div class="verbal-summary">
        Verbal Total: <strong>${verbalTotal.toFixed(2)} / ${verbalMaxTotal}</strong>
      </div>
      ${rows}`;
  }

  printWindow.document.write(buildHtml(examCode, candidateName, headerHTML, bodyHTML));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};

// ── Shared HTML builder ───────────────────────────────────────────────────────
function buildHtml(examCode: string, candidateName: string, headerHTML: string, bodyHTML: string) {
  const css = `
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .info { margin-bottom: 20px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .score-box { background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .score-box h2 { margin: 0; color: #2563eb; }
    .section-title { font-size: 16px; font-weight: bold; color: #333; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .verbal-summary { font-size: 14px; color: #555; margin-bottom: 12px; }

    /* summary table */
    .questions-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .questions-table th, .questions-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    .questions-table th { background: #f8f8f8; }

    /* detailed blocks */
    .q-block { margin-bottom: 20px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }
    .q-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: bold; }
    .q-num { font-size: 15px; color: #333; }
    .q-marks { font-size: 14px; color: #555; }
    .q-text { margin: 8px 0 12px; font-size: 15px; }
    .options { margin-top: 8px; }
    .option { padding: 7px 12px; margin-bottom: 5px; border-radius: 4px; border: 1px solid #e0e0e0; font-size: 14px; }
    .opt-correct          { background: #e8f5e9; border-color: #4caf50; color: #2e7d32; }
    .opt-correct-selected { background: #c8e6c9; border-color: #2e7d32; color: #1b5e20; font-weight: bold; }
    .opt-wrong-selected   { background: #ffebee; border-color: #f44336; color: #c62828; }
    .subj-answers { background: #f9f9f9; padding: 10px 14px; border-radius: 4px; font-size: 14px; }
    .subj-answers div { margin-bottom: 4px; }
    .correct-hint { color: #2e7d32; }

    .correct   { color: green;   font-weight: bold; }
    .incorrect { color: red;     font-weight: bold; }
    .verbal    { color: #ea580c; font-weight: bold; }
    .verbal-block { border-color: #f97316; }
    .verbal-transcript { background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:14px; }
    .vt-label { font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px; }
    .vt-text  { color:#374151;font-style:italic;line-height:1.7; }
    .verbal-feedback { background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:14px; }
    .vf-label { font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px; }
    .vf-text  { color:#374151;line-height:1.7; }

    @media print { body { padding: 20px; } }
  `;

  const safeFilename = `${candidateName}_${examCode}`.replace(/[^a-zA-Z0-9_\-]/g, '_');

  return `<!DOCTYPE html>
<html>
<head>
  <title>${safeFilename}</title>
  <style>${css}</style>
</head>
<body>
  ${headerHTML}
  ${bodyHTML}
</body>
</html>`;
}
