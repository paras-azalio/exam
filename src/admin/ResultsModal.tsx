import React, { useState, useEffect, useRef, useCallback } from 'react';

/** Custom audio player shown in the verbal detail popup. */
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [current, setCurrent]   = useState(0);
  const [duration, setDuration] = useState(0);

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // MediaRecorder blobs have duration=Infinity. Seeking to a huge time
  // forces the browser to clamp to the real end and fire durationchange.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => {
      if (!isFinite(a.duration)) {
        a.currentTime = 1e10;
      } else {
        setDuration(a.duration);
      }
    };
    const onDurChange = () => {
      if (isFinite(a.duration) && a.duration > 0) {
        setDuration(a.duration);
        a.currentTime = 0;
      }
    };
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onDurChange);
    return () => {
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onDurChange);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    playing ? a.pause() : a.play();
  }, [playing]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(ratio * duration);
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 select-none w-full">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onTimeUpdate={() => { const a = audioRef.current; if (a) setCurrent(a.currentTime); }}
      />

      {/* Play / Pause */}
      <button
        onClick={toggle}
        className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-black hover:bg-gray-800 text-white transition"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>

      {/* Current time */}
      <span className="text-[11px] text-gray-500 font-mono w-8 text-right flex-shrink-0">{fmt(current)}</span>

      {/* Progress bar */}
      <div
        className="flex-1 relative h-1 bg-gray-300 rounded-full cursor-pointer"
        onClick={seek}
      >
        <div
          className="absolute left-0 top-0 h-full bg-gray-800 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Duration */}
      <span className="text-[11px] text-gray-500 font-mono w-8 flex-shrink-0">{fmt(duration)}</span>
    </div>
  );
}
import { adminApi, AiResultRow, ExamRow, ResultRow } from './adminApi';
import RecordingsModal from './RecordingsModal';
import { BACKEND_URL } from '../config';

/** Returns true when a verbal AI row is eligible for retry in the admin UI. */
function isRetryEligible(ar: AiResultRow): boolean {
  if (ar.status === 'FAILED') return true;
  if (ar.status === 'SUCCESS') return false;
  // PENDING / SENT and stuck for more than 1 hour
  if (!ar.initiatedAt) return false;
  return new Date(ar.initiatedAt).getTime() < Date.now() - 60 * 60 * 1000;
}

interface Props {
  creds: string;
  exam: ExamRow;
  onClose: () => void;
}

type SortKey = 'studentName' | 'studentEmail' | 'totalScore' | 'score' | 'verbalResult' | 'grade' | 'timeTaken' | 'createdAt';
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
  const [rows, setRows]             = useState<ResultRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [sortKey, setSortKey]       = useState<SortKey>('createdAt');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [checked, setChecked]             = useState<Set<number>>(new Set());
  const [recordingsRow, setRecordingsRow] = useState<ResultRow | null>(null);
  const [expandedVerbal, setExpandedVerbal] = useState<Set<number>>(new Set());
  const [retrying, setRetrying]             = useState<Set<number>>(new Set());
  const [verbalDetailPopup, setVerbalDetailPopup] = useState<AiResultRow | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading]     = useState(false);

  const closeVerbalDetail = () => {
    setVerbalDetailPopup(null);
    setAudioObjectUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  };

  // Fetch audio blob when the verbal detail popup opens; revoke on close.
  useEffect(() => {
    // Revoke previous blob URL to avoid memory leaks
    if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); setAudioObjectUrl(null); }
    if (!verbalDetailPopup?.audioPath) return;

    const [sessionKey, ...rest] = verbalDetailPopup.audioPath.split('/');
    const filePath = rest.join('/');
    if (!sessionKey || !filePath) return;

    setAudioLoading(true);
    fetch(`${BACKEND_URL}/api/admin/recordings/file?sessionKey=${encodeURIComponent(sessionKey)}&filePath=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Basic ${btoa(creds)}` },
    })
      .then(r => r.ok ? r.blob() : Promise.reject(r.status))
      .then(blob => { setAudioObjectUrl(URL.createObjectURL(blob)); })
      .catch(() => { setAudioObjectUrl(null); })
      .finally(() => setAudioLoading(false));

    return () => {
      // cleanup is handled at next open or component unmount
    };
  }, [verbalDetailPopup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    adminApi.getResults(creds, exam.id)
      .then(data => {
        setRows(data);
        // Seed checked set from persisted DB flags
        setChecked(new Set(data.filter(r => r.checked).map(r => r.id)));
        setLoading(false);
      })
      .catch(err => { setError(err.message ?? 'Failed to load results'); setLoading(false); });
  }, []);

  const retryAiResult = (aiResultId: number) => {
    setRetrying(prev => new Set(prev).add(aiResultId));
    adminApi.retryAiEvaluation(creds, aiResultId)
      .then(() => adminApi.getResults(creds, exam.id))
      .then(data => {
        setRows(data);
        setRetrying(prev => { const n = new Set(prev); n.delete(aiResultId); return n; });
      })
      .catch(err => {
        alert(err.message ?? 'Retry failed');
        setRetrying(prev => { const n = new Set(prev); n.delete(aiResultId); return n; });
      });
  };

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
      const nowChecked = !prev.has(id);
      if (nowChecked) next.add(id); else next.delete(id);
      // Persist to backend (fire-and-forget; UI is already optimistic)
      adminApi.updateResultCheck(creds, id, nowChecked).catch(console.error);
      return next;
    });
  };

  const getValue = (row: ResultRow, key: SortKey): number | string | null => {
    switch (key) {
      case 'studentName':  return row.studentName ?? '';
      case 'studentEmail': return row.studentEmail ?? '';
      case 'totalScore':   return row.totalScore;
      case 'score':        return row.score ?? -Infinity;
      case 'verbalResult': return (row.aiResults ?? []).reduce((s, ar) => s + (ar.aiScore ?? 0), 0) || -Infinity;
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl max-h-[95vh] flex flex-col">

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
        <div className="flex-1 overflow-auto overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading results…</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500 text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No submissions yet for this exam.</div>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 w-8">
                    {/* checkbox */}
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 whitespace-nowrap w-8">
                    {/* recordings */}
                  </th>
                  <th className={thClass('studentName')} onClick={() => toggleSort('studentName')}>
                    Name <SortIcon col="studentName" />
                  </th>
                  <th className={thClass('studentEmail')} onClick={() => toggleSort('studentEmail')}>
                    Email <SortIcon col="studentEmail" />
                  </th>
                  <th className={thClass('totalScore')} onClick={() => toggleSort('totalScore')}>
                    Total Marks<SortIcon col="totalScore" />
                  </th>
                  <th className={thClass('score')} onClick={() => toggleSort('score')}>
                    MCQ <SortIcon col="score" />
                  </th>
                  <th className={thClass('verbalResult')} onClick={() => toggleSort('verbalResult')}>
                    Verbal <SortIcon col="verbalResult" />
                  </th>
                  <th className={thClass('grade')} onClick={() => toggleSort('grade')}>
                    Grade <SortIcon col="grade" />
                  </th>
                  <th className={thClass('timeTaken')} onClick={() => toggleSort('timeTaken')}>
                    Total Time Taken <SortIcon col="timeTaken" />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                    Violations
                  </th>
                  <th className={thClass('createdAt')} onClick={() => toggleSort('createdAt')}>
                    Submitted At<SortIcon col="createdAt" />
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
                  const aiResults      = row.aiResults ?? [];
                  const verbalCount    = aiResults.length;
                  const isVerbalExp    = expandedVerbal.has(row.id);
                  const verbalScore    = aiResults.reduce((s, ar) => s + (ar.aiScore ?? 0), 0);
                  const verbalTotalMax = aiResults.reduce((s, ar) => s + (ar.maxMarks ?? 0), 0);
                  const verbalAllDone  = verbalCount > 0 && aiResults.every(ar => ar.status === 'SUCCESS');
                  // totalScore and totalMaxMarks come pre-computed from the server
                  const totalMax  = row.totalMaxMarks;
                  const totalPct  = totalMax > 0
                    ? Math.round((row.totalScore / totalMax) * 100) : null;

                  return (
                    <React.Fragment key={row.id}>
                    <tr
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
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setRecordingsRow(row)}
                          className="text-base hover:scale-110 transition-transform"
                          title="View recordings"
                        >
                          📹
                        </button>
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800">
                        {row.studentName ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {row.studentEmail ?? '—'}
                      </td>
                      {/* Total score cell — always computed server-side */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-baseline gap-1">
                            <span className="font-bold text-sm text-white bg-slate-700 px-2 py-0.5 rounded">
                              {(row.totalScore ?? row.score ?? 0).toFixed(2)}
                            </span>
                            {totalMax > 0 && (
                              <span className="text-gray-500 text-xs">/ {totalMax}</span>
                            )}
                          </div>
                          {totalPct !== null && (
                            <span className={`text-xs font-medium ${row.grade && row.grade !== 'F' ? 'text-green-600' : 'text-red-500'}`}>
                              {totalPct}%
                            </span>
                          )}
                        </div>
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
                          <span className={`ml-2 text-xs font-medium ${row.grade && row.grade !== 'F' ? 'text-green-600' : 'text-red-500'}`}>
                            ({pct}%)
                          </span>
                        )}
                      </td>
                      {/* Verbal score cell */}
                      <td className="px-3 py-3">
                        {verbalCount === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <button
                            onClick={() => setExpandedVerbal(prev => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                              return next;
                            })}
                            className="flex items-center gap-1 text-orange-700 font-semibold hover:underline text-xs"
                            title="Expand verbal question details"
                          >
                            {verbalAllDone
                              ? verbalScore.toFixed(2)
                              : aiResults.some(ar => ar.status === 'SUCCESS')
                                ? `${verbalScore.toFixed(2)}…`
                                : <span className="text-gray-400 font-normal italic">Pending</span>}
                            {verbalTotalMax > 0 && (
                              <span className="text-orange-500 font-normal">/ {verbalTotalMax}</span>
                            )}
                            <span className="text-orange-400 font-normal ml-0.5">({verbalCount}Q)</span>
                            <span className="text-gray-400">{isVerbalExp ? '▾' : '▸'}</span>
                          </button>
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
                      <td className="px-3 py-3 text-center">
                        {row.violations != null ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            row.violations === 0
                              ? 'bg-green-50 text-green-600'
                              : row.violations <= 2
                              ? 'bg-yellow-50 text-yellow-700'
                              : 'bg-red-50 text-red-600'
                          }`}>
                            {row.violations}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {formatDate(row.createdAt)}
                      </td>
                    </tr>
                    {/* Expanded verbal question breakdown — horizontal scrollable cards */}
                    {isVerbalExp && verbalCount > 0 && (
                      <tr key={`verbal-${row.id}`} className="bg-orange-50 border-t border-orange-100">
                        <td colSpan={11} className="px-6 py-4">
                          <p className="text-xs font-semibold text-orange-700 mb-3 text-center tracking-wide uppercase">
                            Verbal Question Scores
                          </p>
                          <div className="flex gap-3 overflow-x-auto pb-1 justify-center">
                            {aiResults.map(ar => {
                              const eligible = isRetryEligible(ar);
                              const isRetrying = retrying.has(ar.id);
                              // Status colours
                              const statusCfg = {
                                SUCCESS: { border: 'border-orange-200', badge: 'bg-green-100 text-green-700',  label: 'Scored' },
                                FAILED:  { border: 'border-red-200',    badge: 'bg-red-100 text-red-600',     label: 'Failed' },
                                SENT:    { border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', label: 'Evaluating…' },
                                PENDING: { border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-500',   label: 'Pending' },
                              }[ar.status] ?? { border: 'border-gray-200', badge: 'bg-gray-100 text-gray-500', label: ar.status };

                              return (
                                <div
                                  key={ar.id}
                                  className={`flex-shrink-0 bg-white border ${statusCfg.border} rounded-xl overflow-hidden text-center`}
                                  style={{ minWidth: '150px' }}
                                >
                                  {/* Score */}
                                  <div className="px-4 py-3">
                                    {ar.status === 'SUCCESS' ? (
                                      <p className="font-bold text-orange-700 text-base whitespace-nowrap">
                                        {Number(ar.aiScore).toFixed(2)}
                                        {ar.maxMarks ? ` / ${ar.maxMarks}` : ''} pts
                                      </p>
                                    ) : (
                                      <p className="text-gray-400 text-sm font-medium">
                                        — {ar.maxMarks ? `/ ${ar.maxMarks} pts` : ''}
                                      </p>
                                    )}
                                    {ar.precisionLevel != null && (
                                      <p className="text-gray-400 text-[11px] mt-0.5">Precision {ar.precisionLevel}</p>
                                    )}
                                    <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCfg.badge}`}>
                                      {statusCfg.label}
                                    </span>
                                  </div>

                                  {/* Actions */}
                                  <div className="border-t border-gray-100 py-1.5 flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => setVerbalDetailPopup(ar)}
                                      className="text-[11px] text-orange-600 hover:text-orange-800 font-medium transition"
                                    >
                                      View ↗
                                    </button>
                                    {eligible && (
                                      <>
                                        <span className="text-gray-200">|</span>
                                        <button
                                          onClick={() => retryAiResult(ar.id)}
                                          disabled={isRetrying}
                                          className="text-[11px] text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition"
                                          title="Re-fire AI evaluation"
                                        >
                                          {isRetrying ? '…' : '↺ Retry'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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

      {/* Recordings sub-modal */}
      {recordingsRow && (
        <RecordingsModal
          creds={creds}
          result={recordingsRow}
          examCode={exam.examCode}
          onClose={() => setRecordingsRow(null)}
        />
      )}

      {/* Verbal question detail popup */}
      {verbalDetailPopup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60] p-4"
          onClick={closeVerbalDetail}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h4 className="font-bold text-gray-800 text-sm">Verbal Question Detail</h4>
              <button onClick={closeVerbalDetail} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* Score */}
            <div className="px-6 pt-5 pb-4 text-center border-b border-gray-100">
              {verbalDetailPopup.status === 'SUCCESS' ? (
                <>
                  <p className="text-4xl font-bold text-orange-700">
                    {Number(verbalDetailPopup.aiScore).toFixed(2)}
                    {verbalDetailPopup.maxMarks != null && verbalDetailPopup.maxMarks > 0 && (
                      <span className="text-2xl text-gray-400 font-normal"> / {verbalDetailPopup.maxMarks}</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">pts</p>
                </>
              ) : (
                <p className="text-2xl font-semibold text-gray-400">
                  {verbalDetailPopup.status === 'FAILED' ? '⚠ Failed' :
                   verbalDetailPopup.status === 'SENT'   ? '⏳ Evaluating…' : '⏳ Pending'}
                  {verbalDetailPopup.maxMarks ? ` / ${verbalDetailPopup.maxMarks} pts` : ''}
                </p>
              )}
              {verbalDetailPopup.precisionLevel != null && (
                <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-3 py-0.5 rounded-full">
                  Precision {verbalDetailPopup.precisionLevel}
                </span>
              )}
            </div>

            {/* Question */}
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Question</p>
              <p className="text-sm text-gray-700 leading-relaxed">{verbalDetailPopup.question}</p>
            </div>

            {/* Expected reply */}
            {verbalDetailPopup.expectedReply && (
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Expected Reply</p>
                <p className="text-xs text-gray-500 leading-relaxed">{verbalDetailPopup.expectedReply}</p>
              </div>
            )}

            {/* Audio playback */}
            {verbalDetailPopup.audioPath && (
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recording</p>
                {audioLoading ? (
                  <div className="text-xs text-gray-400 italic">Loading audio…</div>
                ) : audioObjectUrl ? (
                  <AudioPlayer src={audioObjectUrl} />
                ) : (
                  <div className="text-xs text-red-400 italic">Audio not available</div>
                )}
              </div>
            )}

            {/* Transcript */}
            {verbalDetailPopup.transcript && (
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Transcript</p>
                <p className="text-sm text-gray-700 leading-relaxed italic">"{verbalDetailPopup.transcript}"</p>
              </div>
            )}

            {/* AI Feedback */}
            {verbalDetailPopup.feedback && (
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">AI Feedback</p>
                <div className="flex gap-2">
                  <span className="text-base mt-0.5">💬</span>
                  <p className="text-sm text-gray-700 leading-relaxed">{verbalDetailPopup.feedback}</p>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="px-6 py-3 border-b border-gray-100 flex justify-between text-xs text-gray-400">
              {verbalDetailPopup.initiatedAt && <span>Sent: {new Date(verbalDetailPopup.initiatedAt).toLocaleString()}</span>}
              {verbalDetailPopup.receivedAt  && <span>Received: {new Date(verbalDetailPopup.receivedAt).toLocaleString()}</span>}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 pt-4 flex justify-end">
              <button
                onClick={closeVerbalDetail}
                className="px-5 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
