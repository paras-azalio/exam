import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, ExamRow } from './adminApi';
import ExamFormModal from './ExamFormModal';
import GenerateLinkModal from './GenerateLinkModal';
import ResultsModal from './ResultsModal';
import LiveParticipantsModal from './LiveParticipantsModal';
import { Link } from 'react-router-dom';
import { ExamFormState, defaultForm, jsonToForm } from './types';
import { useEscapeKey } from './useEscapeKey';

interface Props {
  creds: string;
  onLogout: () => void;
}

type ModalState = { mode: 'create' } | { mode: 'edit'; exam: ExamRow };
type View = 'live' | 'trash';

export default function AdminPanel({ creds, onLogout }: Props) {
  const [view, setView]           = useState<View>('live');
  const [exams, setExams]         = useState<ExamRow[]>([]);
  const [trashed, setTrashed]     = useState<ExamRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [modal, setModal]         = useState<ModalState | null>(null);
  const [formActive, setFormActive]     = useState(true);
  const [formInitial, setFormInitial]   = useState<ExamFormState>(defaultForm);
  const [trashId, setTrashId]           = useState<number | null>(null);  // confirm soft-delete
  const [permDeleteId, setPermDeleteId] = useState<number | null>(null);  // confirm permanent delete
  const [linkExam, setLinkExam]         = useState<ExamRow | null>(null);
  const [resultsExam, setResultsExam]   = useState<ExamRow | null>(null);
  const [showLive, setShowLive]         = useState(false);

  const [searchQuery, setSearchQuery]   = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [live, bin] = await Promise.all([
        adminApi.list(creds),
        adminApi.listTrashed(creds),
      ]);
      setExams(live);
      setTrashed(bin);
    } catch {
      setError('Failed to load exams. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [creds]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Live exam actions ───────────────────────────────────────────────────────

  const openCreate = () => {
    setFormInitial(defaultForm());
    setFormActive(true);
    setModal({ mode: 'create' });
  };

  const openEdit = (exam: ExamRow) => {
    try { setFormInitial(jsonToForm(exam.examData)); }
    catch { setFormInitial(defaultForm()); }
    setFormActive(exam.active);
    setModal({ mode: 'edit', exam });
  };

  const handleSave = async (examDataJson: string, active: boolean) => {
    if (modal?.mode === 'create') {
      await adminApi.create(creds, examDataJson, active);
    } else if (modal?.mode === 'edit') {
      await adminApi.update(creds, modal.exam.id, examDataJson, active);
    }
    setModal(null);
    await loadAll();
  };

  const handleToggle = async (id: number) => {
    try {
      const updated = await adminApi.toggle(creds, id);
      setExams(prev => prev.map(e => e.id === id ? updated : e));
    } catch {
      setError('Failed to toggle status.');
    }
  };

  /** Move to trash (soft delete). */
  const handleMoveToTrash = async () => {
    if (trashId == null) return;
    try {
      await adminApi.remove(creds, trashId);
      setTrashId(null);
      await loadAll();
    } catch {
      setError('Failed to move exam to trash.');
    }
  };

  // ── Trash bin actions ───────────────────────────────────────────────────────

  const handleRestore = async (id: number) => {
    try {
      await adminApi.restore(creds, id);
      await loadAll();
    } catch {
      setError('Failed to restore exam.');
    }
  };

  const handleDeletePermanently = async () => {
    if (permDeleteId == null) return;
    try {
      await adminApi.deletePermanently(creds, permDeleteId);
      setPermDeleteId(null);
      await loadAll();
    } catch {
      setError('Failed to permanently delete exam.');
    }
  };

  // ── shared helpers ──────────────────────────────────────────────────────────

  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString() : '—';

  const handleSearchChange = (value: string) => {
  setSearchQuery(value);
  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  searchDebounceRef.current = setTimeout(() => {
    setDebouncedQuery(value.trim().toLowerCase());
  }, 500);
};

const filteredExams = debouncedQuery
  ? exams.filter(e =>
      e.examCode.toLowerCase().includes(debouncedQuery) ||
      e.examTitle.toLowerCase().includes(debouncedQuery)
    )
  : exams;

  // ── Escape = go back ──────────────────────────────────────────────────────────
  // Closes the topmost open layer, then (if nothing is open) steps the Trash view
  // back to the live Exams list. Order mirrors visual stacking: newest layer first.
  useEscapeKey(() => {
    if (modal)              { setModal(null);        return; }
    if (resultsExam)        { setResultsExam(null);  return; }
    if (linkExam)           { setLinkExam(null);     return; }
    if (showLive)           { setShowLive(false);    return; }
    if (permDeleteId != null) { setPermDeleteId(null); return; }
    if (trashId != null)    { setTrashId(null);      return; }
    if (view === 'trash')   { setView('live');       return; }
  });

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between relative">
        <img src="https://www.azalio.io/wp-content/uploads/2021/12/logo@3x-e1645343368292.png" alt="Logo" className="h-11" />
        <div className="absolute left-1/2 -translate-x-1/2 flex items-baseline">
          <span className="font-bold text-lg">EXAMS</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Live proctoring monitor */}
          <button
            onClick={() => setShowLive(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-rose-600 hover:bg-rose-700 text-white transition"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-300 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Live
          </button>
          {/* Trash toggle */}
          <button
            onClick={() => setView(v => v === 'trash' ? 'live' : 'trash')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
              view === 'trash'
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🗑️ Trash
            {trashed.length > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                view === 'trash' ? 'bg-red-400 text-white' : 'bg-red-500 text-white'
              }`}>
                {trashed.length}
              </span>
            )}
          </button>
          <button
            onClick={onLogout}
            className="text-sm text-slate-300 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* ── Live exams view ── */}
        {view === 'live' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Exams</h2>
              <button
                onClick={openCreate}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition text-sm font-medium"
              >
                + New Exam
              </button>
            </div>

            <div className="relative mb-6">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by exam code or title…"
              className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setDebouncedQuery(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                ✕
              </button>
            )}
          </div>


            {loading ? (
              <p className="text-gray-500 text-sm">Loading…</p>
            ) : exams.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg mb-1">No exams yet</p>
                <p className="text-sm">Click "New Exam" to create one.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Exam Code</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Created</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                       {filteredExams.length === 0 && debouncedQuery ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                              No exams match "<span className="font-medium">{debouncedQuery}</span>"
                            </td>
                          </tr>
                        ) : filteredExams.map(exam => (
                          <tr key={exam.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono font-semibold text-gray-800 whitespace-nowrap">
                              <Link
                                to={`/adm/exam/${exam.examCode}`}
                                state={{ exam }}
                                className="text-blue-700 hover:text-blue-900 hover:underline"
                              >
                                {exam.examCode}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{exam.examTitle}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleToggle(exam.id)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                                  exam.active
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                              >
                                {exam.active ? 'Active' : 'Inactive'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(exam.createdAt)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <button onClick={() => setResultsExam(exam)}
                                  className="px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition whitespace-nowrap">
                                  📊 Results
                                </button>
                                <button onClick={() => setLinkExam(exam)}
                                  className="px-2.5 py-1 text-xs bg-violet-50 text-violet-700 rounded hover:bg-violet-100 transition whitespace-nowrap">
                                  🔗 Link
                                </button>
                                <button onClick={() => openEdit(exam)}
                                  className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition">
                                  Edit
                                </button>
                                <button onClick={() => setTrashId(exam.id)}
                                  className="px-2.5 py-1 text-xs bg-orange-50 text-orange-600 rounded hover:bg-orange-100 transition">
                                  🗑️ Trash
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {filteredExams.length === 0 && debouncedQuery ? (
                  <div className="text-center py-10 text-sm text-gray-400">
                    No exams match "<span className="font-medium">{debouncedQuery}</span>"
                  </div>
                ) : filteredExams.map(exam => (
                  <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                           <Link
                            to={`/adm/exam/${exam.examCode}`}
                            state={{ exam }}
                            className="font-mono font-bold text-blue-700 hover:text-blue-900 hover:underline text-sm"
                          >
                            {exam.examCode}
                          </Link>
                          <button
                            onClick={() => handleToggle(exam.id)}
                            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold transition ${
                              exam.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {exam.active ? 'Active' : 'Inactive'}
                          </button>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(exam.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 mb-3">{exam.examTitle}</p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setResultsExam(exam)}
                          className="flex-1 min-w-[80px] py-1.5 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition text-center font-medium">
                          📊 Results
                        </button>
                        <button onClick={() => setLinkExam(exam)}
                          className="flex-1 min-w-[80px] py-1.5 text-xs bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition text-center font-medium">
                          🔗 Link
                        </button>
                        <button onClick={() => openEdit(exam)}
                          className="flex-1 min-w-[60px] py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-center font-medium">
                          Edit
                        </button>
                        <button onClick={() => setTrashId(exam.id)}
                          className="flex-1 min-w-[60px] py-1.5 text-xs bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition text-center font-medium">
                          🗑️ Trash
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Trash bin view ── */}
        {view === 'trash' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Trash</h2>
                <p className="text-sm text-gray-500 mt-0.5">Restore exams or permanently delete them from here.</p>
              </div>
              <button
                onClick={() => setView('live')}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                ← Back to Exams
              </button>
            </div>

            {loading ? (
              <p className="text-gray-500 text-sm">Loading…</p>
            ) : trashed.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-4">🗑️</div>
                <p className="text-lg mb-1">Trash is empty</p>
                <p className="text-sm">Deleted exams will appear here.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[580px]">
                      <thead className="bg-red-50 border-b border-red-100">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Exam Code</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Deleted</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {trashed.map(exam => (
                          <tr key={exam.id} className="hover:bg-gray-50 opacity-75">
                            <td className="px-4 py-3 font-mono font-semibold text-gray-500 whitespace-nowrap line-through">
                              {exam.examCode}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{exam.examTitle}</td>
                            <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                              {fmtDate(exam.deletedAt)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleRestore(exam.id)}
                                  className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition font-medium"
                                >
                                  ↩ Restore
                                </button>
                                <button
                                  onClick={() => setPermDeleteId(exam.id)}
                                  className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium"
                                >
                                  Delete Forever
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {trashed.map(exam => (
                    <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-red-100 p-4 opacity-80">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-mono font-bold text-gray-400 text-sm line-through">{exam.examCode}</span>
                        <span className="text-xs text-gray-400">{fmtDate(exam.deletedAt)}</span>
                      </div>
                      <p className="text-sm text-gray-400 mb-3">{exam.examTitle}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestore(exam.id)}
                          className="flex-1 py-2 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition text-center font-medium"
                        >
                          ↩ Restore
                        </button>
                        <button
                          onClick={() => setPermDeleteId(exam.id)}
                          className="flex-1 py-2 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-center font-medium"
                        >
                          Delete Forever
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-center text-gray-400 mt-6">
                  Items in the trash are not visible to students and cannot be used for new exams.
                </p>
              </>
            )}
          </>
        )}
      </main>

      {/* Create / Edit Modal */}
      {modal && (
        <ExamFormModal
          initial={formInitial}
          active={formActive}
          onActiveChange={setFormActive}
          title={modal.mode === 'create' ? 'New Exam' : `Edit — ${modal.exam.examCode}`}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Results Modal */}
      {resultsExam && (
        <ResultsModal
          creds={creds}
          exam={resultsExam}
          onClose={() => setResultsExam(null)}
        />
      )}

      {/* Generate Link Modal */}
      {linkExam && (
        <GenerateLinkModal
          creds={creds}
          exam={linkExam}
          onClose={() => setLinkExam(null)}
        />
      )}

      {/* Live Proctoring Modal */}
      {showLive && (
        <LiveParticipantsModal onClose={() => setShowLive(false)} />
      )}

      {/* Move to trash confirm */}
      {trashId != null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <p className="font-semibold text-gray-800 mb-1">Move to Trash?</p>
            <p className="text-sm text-gray-500 mb-6">
              The exam will be hidden from students. You can restore it from the trash bin anytime.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setTrashId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveToTrash}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent delete confirm */}
      {permDeleteId != null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-800 mb-1">Delete Forever?</p>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently remove the exam and all its data. <strong>This cannot be undone.</strong>
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setPermDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePermanently}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
