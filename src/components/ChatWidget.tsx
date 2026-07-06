import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../utils/wsClient';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

/**
 * Collapsible chat widget pinned to the candidate's bottom-right corner.
 * Shows an unread badge when the proctor sends a message while it's closed,
 * lets the candidate read the thread and reply.
 */
export default function ChatWidget({ messages, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [seen, setSeen] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Unread = admin messages that arrived after the last time the panel was open.
  const unread = messages.slice(seen).filter((m) => m.sender === 'admin').length;

  useEffect(() => {
    if (open) {
      setSeen(messages.length);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages.length]);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-900 text-white shadow-xl transition"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-sm font-medium">Proctor chat</span>
        {unread > 0 && (
          <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9998] w-80 max-w-[calc(100vw-2.5rem)] h-96 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 text-white">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-sm font-semibold">Proctor chat</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white text-lg leading-none">—</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-6">No messages yet.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === 'candidate' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm ${
                m.sender === 'candidate'
                  ? 'bg-slate-800 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 p-2.5 border-t border-gray-200">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Message the proctor…"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-900 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
}
