import { ExamRow, ResultRow, AiResultRow } from './adminApi';

interface McqDetail {
  questionId:     string;
  questionNumber: number;
  questionText:   string;
  questionType:   string;          // 'mcq' | 'subjective' | 'verbal'
  options:        { id: string; type: string; text?: string }[] | null;
  correctAnswer:  string | string[];
  userAnswer:     string | string[] | null;
  correct:        boolean;
  marksAwarded:   number;
  totalMarks:     number;
}

function timeTaken(row: ResultRow): string {
  if (!row.startedAt || !row.createdAt) return '—';
  const secs = Math.floor((new Date(row.createdAt).getTime() - new Date(row.startedAt).getTime()) / 1000);
  if (secs <= 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function escHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function gradeColor(grade: string | null): string {
  if (!grade) return '#6b7280';
  const g = grade.toUpperCase();
  if (g === 'S' || g === 'A+') return '#059669';
  if (g === 'A' || g === 'B') return '#2563eb';
  if (g === 'P')               return '#16a34a';
  if (g === 'F')               return '#dc2626';
  return '#6b7280';
}

function statusBadge(status: AiResultRow['status']): string {
  const map: Record<string, string> = {
    SUCCESS: 'background:#d1fae5;color:#065f46',
    FAILED:  'background:#fee2e2;color:#991b1b',
    SENT:    'background:#fef3c7;color:#92400e',
    PENDING: 'background:#f3f4f6;color:#6b7280',
  };
  return map[status] ?? map.PENDING;
}

function buildSummaryTable(rows: ResultRow[]): string {
  const rowsHtml = rows.map((r, i) => {
    const verbalTotal    = (r.aiResults ?? []).reduce((s, ar) => s + (ar.aiScore ?? 0), 0);
    const verbalMaxTotal = (r.aiResults ?? []).reduce((s, ar) => s + (ar.maxMarks ?? 0), 0);
    const gColor = gradeColor(r.grade);
    return `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${escHtml(r.studentName)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px">${escHtml(r.studentEmail)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.score ?? 0} / ${r.totalMarks ?? 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${verbalTotal.toFixed(2)} / ${verbalMaxTotal.toFixed(2)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;color:#fff">
        <span style="background:#1e293b;border-radius:6px;padding:2px 8px">${(r.totalScore ?? 0).toFixed(2)} / ${(r.totalMaxMarks ?? 0).toFixed(2)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="background:${gColor};color:#fff;border-radius:20px;padding:2px 10px;font-weight:700;font-size:13px">${escHtml(r.grade) || '—'}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
        ${r.violations != null
          ? `<span style="background:${r.violations === 0 ? '#d1fae5' : r.violations <= 2 ? '#fef3c7' : '#fee2e2'};color:${r.violations === 0 ? '#065f46' : r.violations <= 2 ? '#92400e' : '#991b1b'};border-radius:20px;padding:2px 8px;font-size:13px">${r.violations}</span>`
          : '<span style="color:#d1d5db">—</span>'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px">${timeTaken(r)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px">${fmtDate(r.createdAt)}</td>
    </tr>`;
  }).join('');

  return `
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#1e293b;color:#fff">
        <th style="padding:10px 12px;text-align:left">#</th>
        <th style="padding:10px 12px;text-align:left">Name</th>
        <th style="padding:10px 12px;text-align:left">Email</th>
        <th style="padding:10px 12px;text-align:center">MCQ Score</th>
        <th style="padding:10px 12px;text-align:center">Verbal Score</th>
        <th style="padding:10px 12px;text-align:center">Total Score</th>
        <th style="padding:10px 12px;text-align:center">Grade</th>
        <th style="padding:10px 12px;text-align:center">Violations</th>
        <th style="padding:10px 12px;text-align:center">Time Taken</th>
        <th style="padding:10px 12px;text-align:left">Submitted</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

function buildVerbalSection(aiResults: AiResultRow[], cardIdx: number): string {
  if (!aiResults || aiResults.length === 0) return '';

  const questions = aiResults.map((ar, i) => {
    const bodyId = `qb-${cardIdx}-${i}`;
    const iconId = `qi-${cardIdx}-${i}`;
    return `
    <div style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">

      <!-- Question header (clickable) -->
      <div
        onclick="toggleQ('${bodyId}','${iconId}')"
        style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none"
      >
        <div style="font-weight:700;color:#1e293b;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:12px">
          Q${i + 1}. ${escHtml(ar.question.length > 80 ? ar.question.slice(0, 80) + '…' : ar.question)}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="${statusBadge(ar.status)};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${ar.status}</span>
          <span style="font-weight:700;color:#1e293b;font-size:15px">
            ${ar.aiScore != null ? ar.aiScore.toFixed(2) : '—'}
            <span style="color:#6b7280;font-weight:400;font-size:13px">/ ${ar.maxMarks ?? '—'} pts</span>
          </span>
          <span id="${iconId}" style="font-size:16px;color:#94a3b8;transition:transform .2s;line-height:1">▾</span>
        </div>
      </div>

      <!-- Collapsible question body -->
      <div id="${bodyId}" class="card-body">

        <!-- Question text -->
        <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Question</div>
          <div style="color:#1e293b;font-size:14px;line-height:1.6">${escHtml(ar.question)}</div>
        </div>

        <!-- Expected reply -->
        ${ar.expectedReply ? `
        <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;background:#fafafa">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Expected Reply</div>
          <div style="color:#374151;font-size:13px;line-height:1.7">${escHtml(ar.expectedReply)}</div>
        </div>` : ''}

        <!-- Transcript -->
        <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;background:#fffbeb">
          <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">🎤 Candidate's Answer (Transcript)</div>
          ${ar.transcript
            ? `<div style="color:#374151;font-size:14px;font-style:italic;line-height:1.7">"${escHtml(ar.transcript)}"</div>`
            : `<div style="color:#9ca3af;font-size:13px;font-style:italic">No transcript available</div>`}
        </div>

        <!-- AI Feedback -->
        <div style="padding:14px 16px;background:#f0fdf4">
          <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">💬 AI Feedback</div>
          ${ar.feedback
            ? `<div style="color:#374151;font-size:14px;line-height:1.7">${escHtml(ar.feedback)}</div>`
            : `<div style="color:#9ca3af;font-size:13px;font-style:italic">No feedback available</div>`}
        </div>

        <!-- Timestamps -->
        <div style="padding:8px 16px;background:#f8fafc;border-top:1px solid #f1f5f9;display:flex;gap:24px;font-size:11px;color:#94a3b8">
          ${ar.initiatedAt ? `<span>Sent: ${fmtDate(ar.initiatedAt)}</span>` : ''}
          ${ar.receivedAt  ? `<span>Received: ${fmtDate(ar.receivedAt)}</span>` : ''}
          <span>Precision: ${ar.precisionLevel ?? '—'}</span>
        </div>

      </div><!-- end question body -->
    </div>`;
  }).join('');

  return `
    <div style="margin-top:20px">
      <div style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">
        🎤 Verbal Questions (${aiResults.length})
      </div>
      ${questions}
    </div>`;
}

function buildMcqSection(details: McqDetail[], cardIdx: number): string {
  const mcqOnly = details.filter(d => d.questionType !== 'verbal');
  if (mcqOnly.length === 0) return '';

  const blocks = mcqOnly.map((d, i) => {
    const bodyId  = `mcq-body-${cardIdx}-${i}`;
    const iconId  = `mcq-icon-${cardIdx}-${i}`;
    const notAttempted = d.userAnswer === null || d.userAnswer === undefined ||
      (Array.isArray(d.userAnswer) && d.userAnswer.length === 0);
    const correct = d.correct;

    const headerBg     = correct ? '#f0fdf4' : notAttempted ? '#f8fafc' : '#fef2f2';
    const headerBorder = correct ? '#bbf7d0' : notAttempted ? '#e5e7eb'  : '#fecaca';
    const badgeStyle   = correct
      ? 'background:#d1fae5;color:#065f46'
      : notAttempted
      ? 'background:#f3f4f6;color:#6b7280'
      : 'background:#fee2e2;color:#991b1b';
    const badgeText    = correct ? '✓ Correct' : notAttempted ? '— Skipped' : '✗ Wrong';
    const markSign     = d.marksAwarded > 0 ? '+' : '';
    const markColor    = d.marksAwarded > 0 ? '#16a34a' : d.marksAwarded < 0 ? '#dc2626' : '#6b7280';

    // Options HTML
    let optionsHtml = '';
    const correctIds: string[] = Array.isArray(d.correctAnswer)
      ? d.correctAnswer as string[]
      : d.correctAnswer ? [d.correctAnswer as string] : [];
    const userIds: string[] = Array.isArray(d.userAnswer)
      ? d.userAnswer as string[]
      : d.userAnswer ? [d.userAnswer as string] : [];

    if (d.questionType === 'subjective') {
      const userAns  = userIds.join(' / ') || '(Not answered)';
      const corrAns  = correctIds.join(' / ') || '—';
      optionsHtml = `
        <div style="background:#f9fafb;border-radius:6px;padding:10px 14px;font-size:13px">
          <div style="margin-bottom:5px"><strong>Answer:</strong> ${escHtml(userAns)}</div>
          <div style="color:#16a34a"><strong>Correct:</strong> ${escHtml(corrAns)}</div>
        </div>`;
    } else if (d.options && d.options.length > 0) {
      optionsHtml = d.options.map(opt => {
        const isCorrect  = correctIds.includes(opt.id);
        const isSelected = userIds.includes(opt.id);
        let bg = 'transparent', border = '#e5e7eb', color = '#374151', marker = '○';
        if (isCorrect && isSelected)  { bg = '#bbf7d0'; border = '#16a34a'; color = '#14532d'; marker = '✓'; }
        else if (isCorrect)           { bg = '#d1fae5'; border = '#22c55e'; color = '#166534'; marker = '✓'; }
        else if (isSelected)          { bg = '#fee2e2'; border = '#f87171'; color = '#991b1b'; marker = '✗'; }
        const label = opt.type === 'image'
          ? `[Image option ${opt.id.toUpperCase()}]`
          : escHtml(opt.text ?? '');
        return `<div style="padding:7px 12px;margin-bottom:5px;border-radius:5px;border:1px solid ${border};background:${bg};color:${color};font-size:13px">
          ${marker} (${opt.id.toUpperCase()}) ${label}
        </div>`;
      }).join('');
    }

    return `
    <div style="margin-bottom:10px;border:1px solid ${headerBorder};border-radius:8px;overflow:hidden">
      <!-- MCQ question header -->
      <div
        onclick="toggleQ('${bodyId}','${iconId}')"
        style="background:${headerBg};padding:10px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;border-bottom:1px solid ${headerBorder}"
      >
        <div style="font-size:13px;font-weight:700;color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:12px">
          Q${d.questionNumber}. ${escHtml(d.questionText.length > 80 ? d.questionText.slice(0, 80) + '…' : d.questionText)}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <span style="${badgeStyle};padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700">${badgeText}</span>
          <span style="font-weight:700;color:${markColor};font-size:13px">${markSign}${d.marksAwarded.toFixed(2)} / ${d.totalMarks}</span>
          <span id="${iconId}" style="font-size:14px;color:#94a3b8;transition:transform .2s">▾</span>
        </div>
      </div>
      <!-- Collapsible MCQ body -->
      <div id="${bodyId}" class="card-body" style="padding:12px 14px;background:#fff">
        <div style="font-size:14px;color:#1e293b;line-height:1.6;margin-bottom:10px">${escHtml(d.questionText)}</div>
        ${optionsHtml}
      </div>
    </div>`;
  }).join('');

  return `
    <div style="margin-top:20px">
      <div style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">
        📋 MCQ / Subjective Questions (${mcqOnly.length})
      </div>
      ${blocks}
    </div>`;
}

function buildCandidateCard(row: ResultRow, index: number): string {
  const aiResults      = row.aiResults ?? [];
  const verbalTotal    = aiResults.reduce((s, ar) => s + (ar.aiScore ?? 0), 0);
  const verbalMaxTotal = aiResults.reduce((s, ar) => s + (ar.maxMarks ?? 0), 0);
  const gColor         = gradeColor(row.grade);
  const cardId         = `card-body-${index}`;
  const iconId         = `card-icon-${index}`;

  return `
  <div id="card-${index}" style="margin-bottom:20px;border:2px solid #e5e7eb;border-radius:14px;overflow:hidden;page-break-inside:avoid">

    <!-- Candidate header (clickable toggle) -->
    <div
      onclick="toggleCard(${index})"
      style="background:#1e293b;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none"
    >
      <!-- Left: name + email + score pill -->
      <div style="display:flex;align-items:center;gap:16px;flex:1;min-width:0">
        <div style="font-size:15px;font-weight:800;white-space:nowrap">${index + 1}. ${escHtml(row.studentName)}</div>
        <div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(row.studentEmail)}</div>
        <div style="background:#0f172a;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:700;color:#e2e8f0;white-space:nowrap;flex-shrink:0">
          ${(row.totalScore ?? 0).toFixed(2)} / ${(row.totalMaxMarks ?? 0).toFixed(2)} pts
        </div>
      </div>
      <!-- Right: grade + submitted + chevron -->
      <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;margin-left:12px">
        <div style="background:${gColor};color:#fff;border-radius:6px;padding:2px 14px;font-size:16px;font-weight:900">${row.grade ?? '—'}</div>
        <div style="font-size:11px;color:#64748b;text-align:right">
          ${fmtDate(row.createdAt)}
        </div>
        <div id="${iconId}" style="font-size:18px;color:#94a3b8;transition:transform .2s;line-height:1">▾</div>
      </div>
    </div>

    <!-- Collapsible body -->
    <div id="${cardId}" class="card-body">

      <!-- Score summary row -->
      <div style="display:flex;border-bottom:1px solid #e5e7eb;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;padding:14px 20px;border-right:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">MCQ Score</div>
          <div style="font-size:20px;font-weight:800;color:#1e293b">${row.score ?? 0} <span style="font-size:14px;color:#6b7280;font-weight:400">/ ${row.totalMarks ?? 0}</span></div>
        </div>
        ${aiResults.length > 0 ? `
        <div style="flex:1;min-width:120px;padding:14px 20px;border-right:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Verbal Score</div>
          <div style="font-size:20px;font-weight:800;color:#6366f1">${verbalTotal.toFixed(2)} <span style="font-size:14px;color:#6b7280;font-weight:400">/ ${verbalMaxTotal.toFixed(2)}</span></div>
        </div>` : ''}
        <div style="flex:1;min-width:120px;padding:14px 20px;border-right:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Total Score</div>
          <div style="font-size:20px;font-weight:800;color:#1e293b">${(row.totalScore ?? 0).toFixed(2)} <span style="font-size:14px;color:#6b7280;font-weight:400">/ ${(row.totalMaxMarks ?? 0).toFixed(2)}</span></div>
        </div>
        <div style="flex:1;min-width:100px;padding:14px 20px;border-right:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Violations</div>
          <div style="font-size:20px;font-weight:800;color:${row.violations != null && row.violations > 2 ? '#dc2626' : '#1e293b'}">${row.violations ?? '—'}</div>
        </div>
        <div style="flex:1;min-width:120px;padding:14px 20px">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Time Taken</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b">${timeTaken(row)}</div>
          <div style="font-size:11px;color:#94a3b8">Started: ${fmtDate(row.startedAt)}</div>
        </div>
      </div>

      <!-- MCQ + Verbal sections -->
      <div style="padding:20px">
        ${(() => {
          let mcqHtml = '';
          try {
            if (row.answersJson) {
              const details: McqDetail[] = JSON.parse(row.answersJson);
              mcqHtml = buildMcqSection(details, index);
            }
          } catch { /* ignore parse errors */ }
          return mcqHtml;
        })()}
        ${aiResults.length > 0 ? buildVerbalSection(aiResults, index) : '<div style="color:#9ca3af;font-style:italic;font-size:13px;margin-top:16px">No verbal questions for this submission.</div>'}
      </div>

    </div><!-- end collapsible body -->
  </div>`;
}

export function generateExamReport(exam: ExamRow, rows: ResultRow[]): void {
  const generatedAt = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'medium' });

  // Stats
  const total      = rows.length;
  const passed     = rows.filter(r => r.grade && !['F'].includes(r.grade.toUpperCase())).length;
  const avgScore   = total > 0 ? rows.reduce((s, r) => s + (r.totalScore ?? 0), 0) / total : 0;
  const maxPossible = rows[0]?.totalMaxMarks ?? 0;

  const summaryCards = `
  <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
    <div style="flex:1;min-width:120px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#16a34a">${total}</div>
      <div style="font-size:12px;color:#166534;font-weight:600">Total Submissions</div>
    </div>
    <div style="flex:1;min-width:120px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#2563eb">${passed}</div>
      <div style="font-size:12px;color:#1e40af;font-weight:600">Passed</div>
    </div>
    <div style="flex:1;min-width:120px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#dc2626">${total - passed}</div>
      <div style="font-size:12px;color:#991b1b;font-weight:600">Failed</div>
    </div>
    <div style="flex:1;min-width:120px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#7c3aed">${avgScore.toFixed(1)}</div>
      <div style="font-size:12px;color:#6d28d9;font-weight:600">Avg Score${maxPossible > 0 ? ` / ${maxPossible}` : ''}</div>
    </div>
  </div>`;

  const candidateCards = rows.map((r, i) => buildCandidateCard(r, i)).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${exam.examTitle} — Exam Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; }
    .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
    .card-body { overflow: hidden; transition: max-height .3s ease, opacity .2s ease; }
    .card-body.collapsed { max-height: 0 !important; opacity: 0; }
    @media print {
      body { background: #fff; }
      .container { padding: 0; }
      .no-print { display: none !important; }
      .card-body { max-height: none !important; opacity: 1 !important; }
      .card-body.collapsed { max-height: none !important; opacity: 1 !important; }
    }
  </style>
</head>
<body>
<div class="container">

  <!-- Report header -->
  <div style="background:#1e293b;color:#fff;border-radius:14px;padding:28px 32px;margin-bottom:28px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
      <div>
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">QuickScreen · Exam Report</div>
        <div style="font-size:28px;font-weight:900;margin-bottom:6px">${escHtml(exam.examTitle)}</div>
        <div style="font-family:monospace;font-size:14px;color:#64748b;background:#0f172a;padding:3px 10px;border-radius:6px;display:inline-block">${escHtml(exam.examCode)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:#64748b">Generated</div>
        <div style="font-size:13px;font-weight:600;color:#e2e8f0">${generatedAt}</div>
        <button class="no-print" onclick="window.print()" style="margin-top:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer">🖨 Print / Save PDF</button>
      </div>
    </div>
  </div>

  <!-- Stats -->
  ${summaryCards}

  <!-- Summary table -->
  <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:32px">
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb">
      <div style="font-size:16px;font-weight:700">All Submissions</div>
    </div>
    <div style="overflow-x:auto">
      ${buildSummaryTable(rows)}
    </div>
  </div>

  <!-- Per-candidate detail header + controls -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:10px;border-bottom:3px solid #1e293b;flex-wrap:wrap;gap:10px">
    <div style="font-size:18px;font-weight:800">
      Detailed Results
      <span style="font-size:13px;font-weight:500;color:#6b7280;margin-left:8px">(${rows.length} candidate${rows.length !== 1 ? 's' : ''})</span>
    </div>
    <button id="toggle-all-btn" class="no-print" onclick="toggleAll()" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;color:#374151;cursor:pointer">▸ Collapse All</button>
  </div>

  ${candidateCards}

</div>

<script>
  var TOTAL = ${rows.length};

  // Set natural max-height on every collapsible body so CSS transition works
  window.addEventListener('DOMContentLoaded', function() {
    var all = document.querySelectorAll('.card-body');
    for (var i = 0; i < all.length; i++) {
      all[i].style.maxHeight = all[i].scrollHeight + 'px';
    }
  });

  function toggleCard(i) {
    var body = document.getElementById('card-body-' + i);
    var icon = document.getElementById('card-icon-' + i);
    if (!body) return;
    var collapsed = body.classList.toggle('collapsed');
    if (icon) icon.style.transform = collapsed ? 'rotate(-90deg)' : '';
  }

  function toggleQ(bodyId, iconId) {
    var body = document.getElementById(bodyId);
    var icon = document.getElementById(iconId);
    if (!body) return;
    var collapsed = body.classList.toggle('collapsed');
    if (icon) icon.style.transform = collapsed ? 'rotate(-90deg)' : '';
  }

  var allCollapsed = false;

  function toggleAll() {
    allCollapsed = !allCollapsed;
    for (var i = 0; i < TOTAL; i++) {
      var body = document.getElementById('card-body-' + i);
      var icon = document.getElementById('card-icon-' + i);
      if (body) { allCollapsed ? body.classList.add('collapsed') : body.classList.remove('collapsed'); }
      if (icon) { icon.style.transform = allCollapsed ? 'rotate(-90deg)' : ''; }
    }
    var btn = document.getElementById('toggle-all-btn');
    if (btn) btn.textContent = allCollapsed ? '▾ Expand All' : '▸ Collapse All';
  }
</script>
</body>
</html>`;

  // Trigger download
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const safeName = `${exam.examTitle ?? ''}_${exam.examCode}`
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
