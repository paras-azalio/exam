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

interface McqDetailRow {
  questionId:     string;
  questionNumber: number;
  questionText:   string;
  questionType:   string;
  options:        { id: string; type: string; text?: string }[] | null;
  correctAnswer:  string | string[];
  userAnswer:     string | string[] | null;
  correct:        boolean;
  marksAwarded:   number;
  totalMarks:     number;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s: string, n = 90): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export const generateAdminPDF = (
  candidateName: string,
  examCode: string,
  mcqScore:      number | null,
  mcqMaxMarks:   number | null,
  totalScore:    number,
  totalMaxMarks: number,
  grade:         string | null,
  verbalRows:    AdminPDFVerbalRow[],
  answersJson?:  string | null,
) => {
  const printWindow = window.open('', '', 'height=900,width=960');
  if (!printWindow) return;

  const totalPct = totalMaxMarks > 0 ? (totalScore / totalMaxMarks) * 100 : 0;

  // ── Parse MCQ details ──────────────────────────────────────────────────────
  let mcqDetails: McqDetailRow[] = [];
  try {
    if (answersJson) {
      const parsed: McqDetailRow[] = JSON.parse(answersJson);
      mcqDetails = parsed.filter(d => d.questionType !== 'verbal');
    }
  } catch { /* non-critical */ }

  // ── Header ─────────────────────────────────────────────────────────────────
  const headerHTML = `
    <div class="header">
      <h1>Exam Result Report</h1>
      <p class="sub">Exam Code: ${esc(examCode)}</p>
    </div>
    <div class="info">
      <div class="info-row"><strong>Candidate Name:</strong><span>${esc(candidateName)}</span></div>
      <div class="info-row"><strong>Date:</strong><span>${new Date().toLocaleString()}</span></div>
      ${grade ? `<div class="info-row"><strong>Grade:</strong><span class="grade-badge">${esc(grade)}</span></div>` : ''}
    </div>
    <div class="score-box">
      <h2>Total Score: ${totalScore.toFixed(2)} / ${totalMaxMarks}</h2>
      <p>Percentage: ${totalPct.toFixed(2)}%</p>
      ${mcqScore != null ? `<p style="margin-top:6px;font-size:14px;color:#555">MCQ / Subjective: ${mcqScore.toFixed(2)} / ${mcqMaxMarks ?? '?'}</p>` : ''}
      ${verbalRows.length > 0 ? `<p style="margin-top:4px;font-size:14px;color:#555">Verbal: ${verbalRows.reduce((s,r)=>s+(r.aiScore??0),0).toFixed(2)} / ${verbalRows.reduce((s,r)=>s+(r.maxMarks??0),0)}</p>` : ''}
    </div>
  `;

  // ── MCQ section ────────────────────────────────────────────────────────────
  let mcqHTML = '';
  if (mcqDetails.length > 0) {
    const mcqBlocks = mcqDetails.map((d, i) => {
      const bodyId = `qb-mcq-${i}`;
      const iconId = `qi-mcq-${i}`;
      const notAttempted = d.userAnswer === null || d.userAnswer === undefined ||
        (Array.isArray(d.userAnswer) && d.userAnswer.length === 0);
      const markSign  = d.marksAwarded > 0 ? '+' : '';
      const badgeText = d.correct ? '✓ Correct' : notAttempted ? '— Skipped' : '✗ Wrong';
      const badgeCls  = d.correct ? 'correct' : notAttempted ? 'skipped' : 'incorrect';
      const markColor = d.marksAwarded > 0 ? 'color:green' : d.marksAwarded < 0 ? 'color:red' : 'color:#888';

      const correctIds: string[] = Array.isArray(d.correctAnswer)
        ? d.correctAnswer as string[]
        : d.correctAnswer ? [d.correctAnswer as string] : [];
      const userIds: string[] = Array.isArray(d.userAnswer)
        ? d.userAnswer as string[]
        : d.userAnswer ? [d.userAnswer as string] : [];

      let optionsHTML = '';
      if (d.questionType === 'subjective') {
        const userAns = userIds.join(' / ') || '(Not answered)';
        const corrAns = correctIds.join(' / ') || '—';
        optionsHTML = `
          <div class="subj-answers">
            <div><strong>Answer:</strong> ${esc(userAns)}</div>
            <div class="correct-hint"><strong>Correct:</strong> ${esc(corrAns)}</div>
          </div>`;
      } else if (d.options?.length) {
        optionsHTML = d.options.map(opt => {
          const isCorrect  = correctIds.includes(opt.id);
          const isSelected = userIds.includes(opt.id);
          let cls = 'option', marker = '○';
          if (isCorrect && isSelected)  { cls += ' opt-correct-selected'; marker = '✓'; }
          else if (isCorrect)           { cls += ' opt-correct';          marker = '✓'; }
          else if (isSelected)          { cls += ' opt-wrong-selected';   marker = '✗'; }
          const label = opt.type === 'image'
            ? `[Image option ${opt.id.toUpperCase()}]`
            : esc(opt.text ?? '');
          return `<div class="${cls}">${marker} (${opt.id.toUpperCase()}) ${label}</div>`;
        }).join('');
      }

      return `
        <div class="q-block">
          <div class="q-header collapsible-header" onclick="toggleQ('${bodyId}','${iconId}')">
            <div class="q-header-left">
              <span class="q-num">Q${d.questionNumber}.</span>
              <span class="q-preview">${esc(trunc(d.questionText))}</span>
            </div>
            <div class="q-header-right">
              <span class="${badgeCls}">${badgeText}</span>
              <span class="q-marks" style="${markColor}">${markSign}${d.marksAwarded.toFixed(2)} / ${d.totalMarks}</span>
              <span class="toggle-icon" id="${iconId}">▾</span>
            </div>
          </div>
          <div class="q-body" id="${bodyId}">
            <p class="q-text">${esc(d.questionText)}</p>
            ${optionsHTML}
          </div>
        </div>`;
    }).join('');

    mcqHTML = `
      <div class="section-title">📋 MCQ / Subjective Questions (${mcqDetails.length})</div>
      ${mcqBlocks}`;
  }

  // ── Verbal section ─────────────────────────────────────────────────────────
  let verbalHTML = '';
  if (verbalRows.length > 0) {
    const verbalTotal    = verbalRows.reduce((s, r) => s + (r.aiScore ?? 0), 0);
    const verbalMaxTotal = verbalRows.reduce((s, r) => s + (r.maxMarks ?? 0), 0);

    const verbalBlocks = verbalRows.map((r, i) => {
      const bodyId    = `qb-verbal-${i}`;
      const iconId    = `qi-verbal-${i}`;
      const statusCls = r.status === 'SUCCESS' ? 'correct' : r.status === 'FAILED' ? 'incorrect' : 'verbal';
      const scoreText = r.status === 'SUCCESS' && r.aiScore != null
        ? `${r.aiScore.toFixed(2)} / ${r.maxMarks ?? '?'}`
        : `— / ${r.maxMarks ?? '?'}`;

      return `
        <div class="q-block verbal-block">
          <div class="q-header collapsible-header" onclick="toggleQ('${bodyId}','${iconId}')">
            <div class="q-header-left">
              <span class="q-num">Q${i + 1}.</span>
              <span class="q-preview">${esc(trunc(r.question))}</span>
            </div>
            <div class="q-header-right">
              <span class="${statusCls}">🎤 ${r.status}</span>
              <span class="q-marks">${scoreText}</span>
              <span class="toggle-icon" id="${iconId}">▾</span>
            </div>
          </div>
          <div class="q-body" id="${bodyId}">
            <p class="q-text">${esc(r.question)}</p>
            ${r.expectedReply ? `
            <div class="subj-answers" style="margin-bottom:8px">
              <div><strong>Expected Reply:</strong> ${esc(r.expectedReply)}</div>
            </div>` : ''}
            ${r.transcript
              ? `<div class="verbal-transcript"><div class="vt-label">🎤 Candidate's Answer (Transcript)</div><div class="vt-text">"${esc(r.transcript)}"</div></div>`
              : `<div class="verbal-transcript" style="color:#9ca3af;font-style:italic;font-size:13px">No transcript available</div>`}
            ${r.feedback
              ? `<div class="verbal-feedback"><div class="vf-label">💬 AI Feedback</div><div class="vf-text">${esc(r.feedback)}</div></div>`
              : ''}
          </div>
        </div>`;
    }).join('');

    verbalHTML = `
      <div class="section-title">🎤 Verbal Questions (${verbalRows.length})</div>
      <div class="verbal-summary">Verbal Total: <strong>${verbalTotal.toFixed(2)} / ${verbalMaxTotal}</strong></div>
      ${verbalBlocks}`;
  }

  const bodyHTML = mcqHTML + verbalHTML;

  printWindow.document.write(buildHtml(examCode, candidateName, headerHTML, bodyHTML));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
};

// ── Shared HTML builder ───────────────────────────────────────────────────────
function buildHtml(examCode: string, candidateName: string, headerHTML: string, bodyHTML: string) {
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 860px; margin: 0 auto; color: #1e293b; }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1e293b; padding-bottom: 20px; }
    .header h1 { font-size: 22px; margin-bottom: 4px; }
    .sub { color: #555; font-size: 14px; }
    .info { margin-bottom: 16px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .grade-badge { background: #1e293b; color: #fff; border-radius: 6px; padding: 2px 12px; font-weight: 700; }
    .score-box { background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .score-box h2 { margin: 0 0 6px; color: #2563eb; font-size: 20px; }
    .section-title { font-size: 15px; font-weight: bold; color: #1e293b; margin: 28px 0 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
    .verbal-summary { font-size: 13px; color: #555; margin-bottom: 10px; }

    /* question blocks */
    .q-block { margin-bottom: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
    .verbal-block { border-color: #f97316; }

    /* collapsible header */
    .collapsible-header { display: flex; justify-content: space-between; align-items: center;
      background: #f8fafc; padding: 10px 14px; cursor: pointer; user-select: none;
      border-bottom: 1px solid #e2e8f0; gap: 12px; }
    .verbal-block .collapsible-header { background: #fff7ed; border-color: #fed7aa; }
    .q-header-left  { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow: hidden; }
    .q-header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .q-num     { font-weight: 700; font-size: 14px; white-space: nowrap; }
    .q-preview { font-size: 13px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .q-marks   { font-size: 13px; font-weight: 600; color: #555; white-space: nowrap; }
    .toggle-icon { font-size: 14px; color: #94a3b8; transition: transform .2s; line-height: 1; flex-shrink: 0; }

    /* collapsible body */
    .q-body { overflow: hidden; transition: max-height .3s ease, opacity .2s ease; padding: 14px; background: #fff; }
    .q-body.collapsed { max-height: 0 !important; opacity: 0; padding-top: 0; padding-bottom: 0; }
    .q-text { font-size: 14px; line-height: 1.7; margin-bottom: 12px; color: #1e293b; }

    /* options */
    .option { padding: 7px 12px; margin-bottom: 5px; border-radius: 4px; border: 1px solid #e0e0e0; font-size: 13px; }
    .opt-correct          { background: #e8f5e9; border-color: #4caf50; color: #2e7d32; }
    .opt-correct-selected { background: #c8e6c9; border-color: #2e7d32; color: #1b5e20; font-weight: bold; }
    .opt-wrong-selected   { background: #ffebee; border-color: #f44336; color: #c62828; }
    .subj-answers { background: #f9f9f9; padding: 10px 14px; border-radius: 4px; font-size: 13px; }
    .subj-answers div { margin-bottom: 4px; }
    .correct-hint { color: #2e7d32; }

    /* status badges */
    .correct  { color: #16a34a; font-weight: bold; }
    .incorrect { color: #dc2626; font-weight: bold; }
    .skipped  { color: #6b7280; font-weight: bold; }
    .verbal   { color: #ea580c; font-weight: bold; }

    /* verbal detail */
    .verbal-transcript { background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:13px; }
    .vt-label { font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px; }
    .vt-text  { color:#374151;font-style:italic;line-height:1.7; }
    .verbal-feedback { background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:13px; }
    .vf-label { font-size:10px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px; }
    .vf-text  { color:#374151;line-height:1.7; }

    /* summary table (generatePDF mode) */
    .questions-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .questions-table th, .questions-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    .questions-table th { background: #f8f8f8; }

    @media print {
      body { padding: 20px; }
      .q-body { max-height: none !important; opacity: 1 !important; padding: 14px !important; }
      .q-body.collapsed { max-height: none !important; opacity: 1 !important; padding: 14px !important; }
      .toggle-icon { display: none; }
      .collapsible-header { cursor: default; }
    }
  `;

  const safeFilename = `${candidateName}_${examCode}`.replace(/[^a-zA-Z0-9_\-]/g, '_');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeFilename}</title>
  <style>${css}</style>
</head>
<body>
  ${headerHTML}
  ${bodyHTML}
  <script>
    window.addEventListener('DOMContentLoaded', function() {
      var all = document.querySelectorAll('.q-body');
      for (var i = 0; i < all.length; i++) {
        all[i].style.maxHeight = all[i].scrollHeight + 'px';
      }
    });
    function toggleQ(bodyId, iconId) {
      var body = document.getElementById(bodyId);
      var icon = document.getElementById(iconId);
      if (!body) return;
      var collapsed = body.classList.toggle('collapsed');
      if (icon) icon.style.transform = collapsed ? 'rotate(-90deg)' : '';
    }
  <\/script>
</body>
</html>`;
}
