import { useState, useEffect } from 'react';
import { adminApi, ExamRow, ResultRow } from './adminApi';

interface Props {
  creds: string;
  exam: ExamRow;
  onClose: () => void;
}

type SortKey = 'studentName' | 'studentEmail' | 'score' | 'grade' | 'timeTaken' | 'createdAt';
type SortDir = 'asc' | 'desc';

/** Returns duration in seconds between startedAt and createdAt, or null. */
function timeTakenSeconds(row: ResultRow): number | null {
  if (!row.startedAt || !row.createdAt) return null;
  const start = new Date(row.startedAt).getTime();
  const end   = new Date(row.createdAt).getTime();
  const diff  = end - start;
  return diff > 0 ? Math.floor(diff / 1000) : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ResultsModal({ creds, exam, onClose }: Props) {
  const [rows, setRows]       = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Set of row IDs that are "checked" (flagged / moved to bottom)
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    adminApi.getResults(creds, exam.id)
      .then(data => { setRows(data); setLoading(false); })
      .catch(err  => { setError(err.message ?? 'Failed to load results'); setLoading(false); });
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleCheck = (id: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getValue = (row: ResultRow, key: SortKey): number | string | null => {
    switch (key) {
      case 'studentName':  return row.studentName ?? '';
      case 'studentEmail': return row.studentEmail ?? '';
      case 'score':        return row.score ?? -Infinity;
      case 'grade':        return row.grade ?? '';
      case 'timeTaken':    return timeTakenSeconds(row) ?? -1;
      case 'createdAt':    return row.createdAt ?? '';
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const aChecked = checked.has(a.id);
    const bChecked = checked.has(b.id);
    // Checked rows always go to the bottom
    if (aChecked !== bChecked) return aChecked ? 1 : -1;

    const av = getValue(a, sortKey);
    const bv = getValue(b, sortKey);
    let cmp = 0;
    if (av === null || av === undefined) cmp = 1;
    else if (bv === null || bv === undefined) cmp = -1;
    else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-slate-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const thClass = (col: SortKey) =>
    `px-3 py-2.5 text-left text-xs font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">Results</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono font-semibold">{exam.examCode}</span>
              {' · '}{exam.examTitle}
              {!loading && !error && (
                <span className="ml-2 text-gray-400">({rows.length} submission{rows.length !== 1 ? 's' : ''})</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading results…</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500 text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No submissions yet for this exam.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 w-8">
                    {/* checkbox column header */}
                  </th>
                  <th className={thClass('studentName')} onClick={() => toggleSort('studentName')}>
                    Name <SortIcon col="studentName" />
                  </th>
                  <th className={thClass('studentEmail')} onClick={() => toggleSort('studentEmail')}>
                    Email <SortIcon col="studentEmail" />
                  </th>
                  <th className={thClass('score')} onClick={() => toggleSort('score')}>
                    Score <SortIcon col="score" />
                  </th>
                  <th className={thClass('grade')} onClick={() => toggleSort('grade')}>
                    Grade <SortIcon col="grade" />
                  </th>
                  <th className={thClass('timeTaken')} onClick={() => toggleSort('timeTaken')}>
                    Time Taken <SortIcon col="timeTaken" />
                  </th>
                  <th className={thClass('createdAt')} onClick={() => toggleSort('createdAt')}>
                    Submitted <SortIcon col="createdAt" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(row => {
                  const isChecked = checked.has(row.id);
                  const tt = timeTakenSeconds(row);
                  const pct = row.totalMarks && row.totalMarks > 0 && row.score !== null
                    ? Math.round((row.score / row.totalMarks) * 100)
                    : null;
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-gray-50 transition ${isChecked ? 'opacity-50 bg-gray-50' : ''}`}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          className="w-3.5 h-3.5 accent-slate-700 cursor-pointer"
                          title="Flag / move to bottom"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800">
                        {row.studentName ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {row.studentEmail ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        {row.score !== null ? (
                          <span className="font-semibold text-gray-800">
                            {row.score}
                            {row.totalMarks !== null && (
                              <span className="font-normal text-gray-500"> / {row.totalMarks}</span>
                            )}
                          </span>
                        ) : '—'}
                        {pct !== null && (
                          <span className={`ml-2 text-xs font-medium ${pct >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                            ({pct}%)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {row.grade ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-bold">
                            {row.grade}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-600 font-mono text-xs">
                        {formatDuration(tt)}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {formatDate(row.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
