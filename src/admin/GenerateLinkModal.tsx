import { useState } from 'react';
import { adminApi, ExamRow } from './adminApi';

interface Props {
  creds: string;
  exam: ExamRow;
  onClose: () => void;
}

type ModalStep = 'form' | 'result';

export default function GenerateLinkModal({ creds, exam, onClose }: Props) {
  const [step, setStep]           = useState<ModalStep>('form');
  const [userName, setUserName]   = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [validFor, setValidFor]   = useState(1440); // minutes, default 24 h
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [link, setLink]           = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied]       = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) {
      setError('Name and email are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.generateLink(creds, exam.id, userName.trim(), userEmail.trim(), validFor);
      setLink(res.link);
      setExpiresAt(res.expiresAt);
      setStep('result');
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate link.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">Generate Invite Link</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Exam: <span className="font-mono font-semibold">{exam.examCode}</span>
              {' · '}{exam.examTitle}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleGenerate} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Name</label>
              <input
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="Enter candidate name"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Email</label>
              <input
                type="email"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                placeholder="Enter candidate email"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link valid for</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: '1 hour',   value: 60 },
                  { label: '6 hours',  value: 360 },
                  { label: '24 hours', value: 1440 },
                  { label: '3 days',   value: 4320 },
                  { label: '7 days',   value: 10080 },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValidFor(opt.value)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                      validFor === opt.value
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Or enter custom minutes:&nbsp;
                <input
                  type="number"
                  value={validFor}
                  min={1}
                  onChange={e => setValidFor(Number(e.target.value))}
                  className="w-20 px-2 py-0.5 text-xs border border-gray-300 rounded outline-none"
                />
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition disabled:opacity-50"
              >
                {loading ? 'Generating…' : 'Generate Link'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <svg className="w-8 h-8 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-green-800 text-sm">Link generated for {userName}</p>
                <p className="text-xs text-green-600">{userEmail} · Expires: {expiresAt}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Invite Link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  className="flex-1 px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg bg-gray-50 outline-none select-all"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={handleCopy}
                  className={`px-4 py-2 text-sm rounded-lg transition font-medium whitespace-nowrap ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-800 text-white hover:bg-slate-900'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-between pt-1">
              <button
                onClick={() => { setStep('form'); setUserName(''); setUserEmail(''); setLink(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition"
              >
                Generate another
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
