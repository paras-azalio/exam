import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import { createStompClient, parseBody, publishSafe, PresencePayload } from '../utils/wsClient';
import LiveViewer from './LiveViewer';

interface Props {
  onClose: () => void;
}

type ConnState = 'connecting' | 'connected' | 'failed';

/**
 * HR Admin roster of candidates currently taking a live-proctored exam.
 *
 * Subscribes to /topic/presence and asks the backend to sync the current roster
 * on connect. Each row exposes a "View Live Stream" button that opens LiveViewer
 * for that candidate; closing the viewer returns here.
 */
export default function LiveParticipantsModal({ onClose }: Props) {
  const [roster, setRoster] = useState<PresencePayload[]>([]);
  const [state, setState] = useState<ConnState>('connecting');
  const [selected, setSelected] = useState<PresencePayload | null>(null);

  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    const client = createStompClient(
      () => {
        setState('connected');
        client.subscribe('/topic/presence', (message) => {
          setRoster(parseBody<PresencePayload[]>(message));
        });
        // Ask the backend to push the current roster right away.
        publishSafe(client, '/app/presence/sync', '{}');
        // The very first sync can race the broker registering our SUBSCRIBE, so the
        // initial roster broadcast may miss us — leaving the list empty even though
        // candidates are already live. Re-sync once the subscription is firmly in
        // place so already-present candidates reliably appear.
        setTimeout(() => publishSafe(clientRef.current, '/app/presence/sync', '{}'), 600);
      },
      () => setState('failed'),
    );
    clientRef.current = client;
    client.activate();

    return () => {
      clientRef.current?.deactivate();
      clientRef.current = null;
    };
  }, []);

  const statusBadge = (status: PresencePayload['status']) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      submitting: 'bg-amber-100 text-amber-700',
      left: 'bg-gray-100 text-gray-500',
    };
    return map[status] ?? 'bg-gray-100 text-gray-500';
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {state === 'connected' && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  state === 'connected' ? 'bg-rose-500' : state === 'failed' ? 'bg-gray-400' : 'bg-amber-400'
                }`} />
              </span>
              <div>
                <h3 className="font-bold text-gray-800">Live Proctoring</h3>
                <p className="text-xs text-gray-500">
                  {state === 'connected'
                    ? `${roster.length} candidate${roster.length === 1 ? '' : 's'} online`
                    : state === 'failed' ? 'Connection failed' : 'Connecting…'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>

          {/* Roster */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {state === 'failed' && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Couldn’t reach the live server. Check that the backend is running and try reopening.
              </p>
            )}

            {state !== 'failed' && roster.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-2">📡</div>
                <p className="text-sm">No candidates are live right now.</p>
                <p className="text-xs mt-1">They’ll appear here once they start a live-proctored exam.</p>
              </div>
            )}

            {roster.map((c) => (
              <div
                key={c.sessionKey}
                className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-4 py-3 hover:border-slate-300 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{c.name || 'Candidate'}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{c.examCode} · {c.sessionKey}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>
                    {c.status}
                  </span>
                  <button
                    onClick={() => setSelected(c)}
                    className="px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    View Live Stream
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full-screen viewer for the selected candidate */}
      {selected && (
        <LiveViewer candidate={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
