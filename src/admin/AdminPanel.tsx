import { useState, useEffect, useCallback } from 'react';
import { adminApi, ExamRow } from './adminApi';
import ExamFormModal from './ExamFormModal';
import { ExamFormState, defaultForm, jsonToForm } from './types';

interface Props {
  creds: string;
  onLogout: () => void;
}

type ModalState = { mode: 'create' } | { mode: 'edit'; exam: ExamRow };

export default function AdminPanel({ creds, onLogout }: Props) {
  const [exams, setExams]     = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [modal, setModal]     = useState<ModalState | null>(null);
  const [formActive, setFormActive] = useState(true);
  const [formInitial, setFormInitial] = useState<ExamFormState>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setExams(await adminApi.list(creds));
    } catch {
      setError('Failed to load exams. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [creds]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setFormInitial(defaultForm());
    setFormActive(true);
    setModal({ mode: 'create' });
  };

  const openEdit = (exam: ExamRow) => {
    try {
      setFormInitial(jsonToForm(exam.examData));
    } catch {
      setFormInitial(defaultForm());
    }
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
    await load();
  };

  const handleToggle = async (id: number) => {
    try {
      const updated = await adminApi.toggle(creds, id);
      setExams(prev => prev.map(e => e.id === id ? updated : e));
    } catch {
      setError('Failed to toggle status.');
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await adminApi.remove(creds, deleteId);
      setDeleteId(null);
      await load();
    } catch {
      setError('Failed to delete exam.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <span className="font-bold text-lg">QuickScreen</span>
          <span className="ml-2 text-slate-400 text-sm">Admin</span>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-slate-300 hover:text-white transition"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Exams</h2>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition text-sm font-medium"
          >
            + New Exam
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : exams.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-1">No exams yet</p>
            <p className="text-sm">Click "New Exam" to create one.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Exam Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Created</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {exams.map(exam => (
                  <tr key={exam.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">{exam.examCode}</td>
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
                    <td className="px-4 py-3 text-gray-500">
                      {exam.createdAt ? new Date(exam.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEdit(exam)}
                        className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(exam.id)}
                        className="px-3 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* Delete Confirm */}
      {deleteId != null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <p className="font-semibold text-gray-800 mb-2">Delete this exam?</p>
            <p className="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
