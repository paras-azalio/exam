import { ExamRow, ResultRow, AiResultRow } from './adminApi';

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

function buildVerbalSection(aiResults: AiResultRow[]): string {
  if (!aiResults || aiResults.length === 0) return '';

  const questions = aiResults.map((ar, i) => `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <!-- Question header -->
      <div style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;color:#1e293b;font-size:14px">Q${i + 1}. <span style="font-family:monospace;color:#6366f1;font-size:12px">${escHtml(ar.questionId)}</span></div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="${statusBadge(ar.status)};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${ar.status}</span>
          <span style="font-weight:700;color:#1e293b;font-size:15px">${ar.aiScore != null ? ar.aiScore.toFixed(2) : '—'} <span style="color:#6b7280;font-weight:400;font-size:13px">/ ${ar.maxMarks ?? '—'} pts</span></span>
        </div>
      </div>

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
      ${ar.transcript ? `
      <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;background:#fffbeb">
        <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">🎤 Candidate's Answer (Transcript)</div>
        <div style="color:#374151;font-size:14px;font-style:italic;line-height:1.7">"${escHtml(ar.transcript)}"</div>
      </div>` : `
      <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;background:#fffbeb">
        <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">🎤 Candidate's Answer (Transcript)</div>
        <div style="color:#9ca3af;font-size:13px;font-style:italic">No transcript available</div>
      </div>`}

      <!-- AI Feedback -->
      ${ar.feedback ? `
      <div style="padding:14px 16px;background:#f0fdf4">
        <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">💬 AI Feedback</div>
        <div style="color:#374151;font-size:14px;line-height:1.7">${escHtml(ar.feedback)}</div>
      </div>` : `
      <div style="padding:14px 16px;background:#f0fdf4">
        <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">💬 AI Feedback</div>
        <div style="color:#9ca3af;font-size:13px;font-style:italic">No feedback available</div>
      </div>`}

      <!-- Timestamps -->
      <div style="padding:8px 16px;background:#f8fafc;border-top:1px solid #f1f5f9;display:flex;gap:24px;font-size:11px;color:#94a3b8">
        ${ar.initiatedAt ? `<span>Sent: ${fmtDate(ar.initiatedAt)}</span>` : ''}
        ${ar.receivedAt  ? `<span>Received: ${fmtDate(ar.receivedAt)}</span>` : ''}
        <span>Precision: ${ar.precisionLevel ?? '—'}</span>
      </div>
    </div>`).join('');

  return `
    <div style="margin-top:20px">
      <div style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">
        🎤 Verbal Questions (${aiResults.length})
      </div>
      ${questions}
    </div>`;
}

function buildCandidateCard(row: ResultRow, index: number): string {
  const aiResults      = row.aiResults ?? [];
  const verbalTotal    = aiResults.reduce((s, ar) => s + (ar.aiScore ?? 0), 0);
  const verbalMaxTotal = aiResults.reduce((s, ar) => s + (ar.maxMarks ?? 0), 0);
  const gColor         = gradeColor(row.grade);

  return `
  <div style="margin-bottom:32px;border:2px solid #e5e7eb;border-radius:14px;overflow:hidden;page-break-inside:avoid">

    <!-- Candidate header -->
    <div style="background:#1e293b;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:18px;font-weight:800">${index + 1}. ${escHtml(row.studentName)}</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:2px">${escHtml(row.studentEmail)}</div>
      </div>
      <div style="text-align:right">
        <div style="background:${gColor};color:#fff;border-radius:8px;padding:4px 18px;font-size:22px;font-weight:900;display:inline-block">${row.grade ?? '—'}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px">${fmtDate(row.createdAt)}</div>
      </div>
    </div>

    <!-- Score summary -->
    <div style="display:flex;border-bottom:1px solid #e5e7eb">
      <div style="flex:1;padding:14px 20px;border-right:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">MCQ Score</div>
        <div style="font-size:20px;font-weight:800;color:#1e293b">${row.score ?? 0} <span style="font-size:14px;color:#6b7280;font-weight:400">/ ${row.totalMarks ?? 0}</span></div>
      </div>
      ${aiResults.length > 0 ? `
      <div style="flex:1;padding:14px 20px;border-right:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Verbal Score</div>
        <div style="font-size:20px;font-weight:800;color:#6366f1">${verbalTotal.toFixed(2)} <span style="font-size:14px;color:#6b7280;font-weight:400">/ ${verbalMaxTotal.toFixed(2)}</span></div>
      </div>` : ''}
      <div style="flex:1;padding:14px 20px;border-right:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Total Score</div>
        <div style="font-size:20px;font-weight:800;color:#1e293b">${(row.totalScore ?? 0).toFixed(2)} <span style="font-size:14px;color:#6b7280;font-weight:400">/ ${(row.totalMaxMarks ?? 0).toFixed(2)}</span></div>
      </div>
      <div style="flex:1;padding:14px 20px;border-right:1px solid #e5e7eb">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Violations</div>
        <div style="font-size:20px;font-weight:800;color:${row.violations != null && row.violations > 2 ? '#dc2626' : '#1e293b'}">${row.violations ?? '—'}</div>
      </div>
      <div style="flex:1;padding:14px 20px">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Time Taken</div>
        <div style="font-size:16px;font-weight:700;color:#1e293b">${timeTaken(row)}</div>
        <div style="font-size:11px;color:#94a3b8">Started: ${fmtDate(row.startedAt)}</div>
      </div>
    </div>

    <!-- Verbal section -->
    <div style="padding:20px">
      ${aiResults.length > 0 ? buildVerbalSection(aiResults) : '<div style="color:#9ca3af;font-style:italic;font-size:13px">No verbal questions for this submission.</div>'}
    </div>
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
    @media print {
      body { background: #fff; }
      .container { padding: 0; }
      .no-print { display: none !important; }
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

  <!-- Per-candidate detail -->
  <div style="font-size:18px;font-weight:800;margin-bottom:20px;padding-bottom:10px;border-bottom:3px solid #1e293b">
    Detailed Results
  </div>
  ${candidateCards}

</div>
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
