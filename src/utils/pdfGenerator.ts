import { ExamData } from '../types/exam';

export const generatePDF = (
  examData: ExamData,
  studentName: string,
  score: number,
  totalMarks: number,
  details: any[],
  pdfMode: 'marks-only' | 'summary' | 'detailed' = 'summary'
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
      <div class="info-row"><strong>Student Name:</strong><span>${studentName}</span></div>
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
    // Nothing extra — the score box in the header is all we show.
    bodyHTML = '';

  } else if (pdfMode === 'summary') {
    // Question number + correct / wrong + marks per question
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
            .map(
              (d) => `
            <tr>
              <td>Question ${d.questionNumber}</td>
              <td class="${d.correct ? 'correct' : 'incorrect'}">
                ${d.correct ? '✓ Correct' : '✗ Incorrect'}
              </td>
              <td>${d.marksAwarded >= 0 ? '+' : ''}${d.marksAwarded.toFixed(2)}</td>
              <td>${d.totalMarks}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;

  } else {
    // pdfMode === 'detailed'
    // Full question text + all options (with correct / selected highlighting) + marks
    bodyHTML = details
      .map((d) => {
        let optionsHTML = '';

        if (d.questionType === 'mcq' && Array.isArray(d.options)) {
          const userSel: string[] = d.userAnswer
            ? Array.isArray(d.userAnswer)
              ? d.userAnswer
              : [d.userAnswer]
            : [];
          const correct: string[] = Array.isArray(d.correctAnswer)
            ? d.correctAnswer
            : [d.correctAnswer];

          const optionRows = d.options
            .map((opt: any) => {
              const isCorrect = correct.includes(opt.id);
              const isSelected = userSel.includes(opt.id);

              let cls = 'option';
              let marker = '○';
              if (isCorrect && isSelected) { cls += ' opt-correct-selected'; marker = '✓'; }
              else if (isCorrect)          { cls += ' opt-correct';          marker = '✓'; }
              else if (isSelected)         { cls += ' opt-wrong-selected';   marker = '✗'; }

              const label =
                opt.type === 'image'
                  ? `<em>[Image option ${opt.id.toUpperCase()}]</em>`
                  : opt.text;

              return `<div class="${cls}">${marker} (${opt.id.toUpperCase()}) ${label}</div>`;
            })
            .join('');

          optionsHTML = `<div class="options">${optionRows}</div>`;

        } else if (d.questionType === 'subjective') {
          const userAns = d.userAnswer
            ? Array.isArray(d.userAnswer)
              ? d.userAnswer[0]
              : d.userAnswer
            : '<em>(Not answered)</em>';
          const correctAns = Array.isArray(d.correctAnswer)
            ? d.correctAnswer.join(' / ')
            : d.correctAnswer;

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

  // ── CSS ──────────────────────────────────────────────────────────────────────
  const css = `
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .info { margin-bottom: 20px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .score-box { background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .score-box h2 { margin: 0; color: #2563eb; }

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

    /* status colours (shared) */
    .correct   { color: green;  font-weight: bold; }
    .incorrect { color: red;    font-weight: bold; }

    @media print { body { padding: 20px; } }
  `;

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Exam Result - ${examData.examCode}</title>
  <style>${css}</style>
</head>
<body>
  ${headerHTML}
  ${bodyHTML}
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
};
