import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import {
  createStompClient,
  parseBody,
  publishSafe,
  RTC_CONFIG,
  PresencePayload,
  SignalMessage,
  ChatMessage,
} from '../utils/wsClient';

interface Props {
  candidate: PresencePayload;
  onClose: () => void;
}

type ConnState = 'connecting' | 'waiting' | 'live' | 'closed' | 'failed';

/**
 * HR Admin live viewer — two-way A/V + chat for a single candidate.
 *
 * The admin is the WebRTC offerer/receiver. It starts by receiving the candidate's
 * camera + screen (recvonly). When the admin toggles their own mic/camera on, those
 * tracks are added to the SAME peer connection and `onnegotiationneeded` fires,
 * which sends a fresh offer so the link upgrades to two-way without dropping.
 * Toggling off removes the tracks and renegotiates again, so the candidate's
 * floating proctor window disappears on its own.
 */
export default function LiveViewer({ candidate, onClose }: Props) {
  const sessionKey = candidate.sessionKey;

  const [state, setState] = useState<ConnState>('connecting');
  const [hasCamera, setHasCamera] = useState(false); // candidate camera inbound
  const [hasScreen, setHasScreen] = useState(false); // candidate screen inbound
  const [micOn, setMicOn] = useState(false);         // admin outbound mic
  const [camOn, setCamOn] = useState(false);         // admin outbound camera
  const [mediaError, setMediaError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const clientRef = useRef<Client | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamMapRef = useRef<Record<string, 'camera' | 'screen'>>({});
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const needsNegoRef = useRef(false); // a renegotiation was requested while one was in flight
  const iceRetryRef = useRef(0);      // bounded ICE-restart attempts on failure
  const peerBuiltRef = useRef(false); // build the peer + initial offer exactly once

  // Inbound-state mirrors (refs avoid stale closures inside the once-only effect).
  const hasCameraRef = useRef(false);
  const hasScreenRef = useRef(false);

  // Admin outbound media — DEDICATED sendonly transceivers so addTransceiver never
  // cannibalises the recvonly receive transceivers (that bug blanks the candidate
  // feed and drops the connection on renegotiation).
  const outStreamRef = useRef<MediaStream | null>(null);
  const micTxRef = useRef<RTCRtpTransceiver | null>(null);
  const camTxRef = useRef<RTCRtpTransceiver | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  // Live mirrors of the outbound on/off state so signaling code (which lives in a
  // mount-only effect and can't see fresh `micOn`/`camOn` state) reads the truth.
  const micOnRef = useRef(false);
  const camOnRef = useRef(false);

  // Set inside the connection effect; lets the toggle handlers (which live in
  // component scope) trigger a renegotiation after replaceTrack so the new track's
  // SSRC is signalled in fresh SDP — without it, a pre-negotiated empty m-line
  // streams RTP the candidate can't demux across a real network (→ black video).
  const negotiateRef = useRef<(() => void) | null>(null);

  // Unique id for THIS viewing session. We build a fresh RTCPeerConnection every
  // mount, so the candidate must rebuild its peer to match — it keys off this id.
  const sessionIdRef = useRef<string>('');
  if (!sessionIdRef.current) {
    sessionIdRef.current =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  }

  // Tell the candidate EXACTLY what we're sending. The candidate shows/hides its
  // floating proctor window from this message — never from inferred track state.
  const sendMediaState = () => {
    publishSafe(clientRef.current, '/app/signal', JSON.stringify({
      sessionKey, sender: 'admin', kind: 'media-state',
      media: { video: camOnRef.current, audio: micOnRef.current },
      session: sessionIdRef.current,
    } as SignalMessage));
  };

  // Attach the admin's own outbound stream to the self-preview AFTER the <video>
  // element actually mounts (it only renders while camOn). Setting srcObject inside
  // toggleCam ran before the element existed, leaving the preview black.
  useEffect(() => {
    if (camOn && selfVideoRef.current && outStreamRef.current) {
      selfVideoRef.current.srcObject = outStreamRef.current;
      selfVideoRef.current.play().catch(() => { /* autoplay guard */ });
    }
  }, [camOn]);

  // ── Connection lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const publishSignal = (msg: SignalMessage) => {
      publishSafe(clientRef.current, '/app/signal',
        JSON.stringify({ ...msg, session: sessionIdRef.current }));
    };

    const attachStream = (role: 'camera' | 'screen', stream: MediaStream) => {
      if (role === 'camera') {
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
        hasCameraRef.current = true;
        setHasCamera(true);
      } else {
        if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
        hasScreenRef.current = true;
        setHasScreen(true);
      }
    };

    const buildPeerAndOffer = () => {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          publishSignal({ sessionKey, sender: 'admin', kind: 'ice-candidate', candidate: e.candidate.toJSON() });
        }
      };

      // Incoming candidate media (camera/screen + mic).
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (!stream) return;
        if (e.track.kind === 'audio') return; // candidate mic plays via the camera element
        const role = streamMapRef.current[stream.id];
        if (role) attachStream(role, stream);
        else if (!hasCameraRef.current) attachStream('camera', stream);
        else attachStream('screen', stream);
      };

      pc.onconnectionstatechange = () => {
        console.log('[webrtc:admin] connection state →', pc.connectionState);
        if (pc.connectionState === 'connected') {
          iceRetryRef.current = 0;
          setState('live');
        } else if (pc.connectionState === 'failed') {
          setState('failed');
          // Try to recover transient ICE failures. restartIce() triggers
          // onnegotiationneeded → a fresh offer with new ICE credentials.
          // (If there is genuinely no path — no TURN, blocked network — this
          //  won't help and you must fix the environment; see notes.)
          if (iceRetryRef.current < 2) {
            iceRetryRef.current += 1;
            console.warn(`[webrtc:admin] ICE failed — restart attempt ${iceRetryRef.current}`);
            try { pc.restartIce(); } catch (err) { console.error('[webrtc:admin] restartIce failed', err); }
          }
        }
      };

      // Auto-(re)negotiation: fires for the initial transceivers AND whenever the
      // admin adds/removes their own tracks. Guarded so a new offer is never started
      // while one is still in flight (that throws InvalidState and wedges the call);
      // the pending request resumes once the current answer is applied.
      pc.onnegotiationneeded = () => { negotiate(); };

      // Declare the media lines we expect to RECEIVE from the candidate.
      // Adding these triggers onnegotiationneeded → the initial offer is sent.
      pc.addTransceiver('video', { direction: 'recvonly' }); // candidate camera
      pc.addTransceiver('video', { direction: 'recvonly' }); // candidate screen
      pc.addTransceiver('audio', { direction: 'recvonly' }); // candidate mic

      // PRE-CREATE the admin's OWN outbound mic + camera m-lines now, with no track
      // yet. Turning the mic/camera on later is then a pure sender.replaceTrack(...)
      // — NO renegotiation. The previous design added these transceivers on toggle,
      // which forced a renegotiation that raced with ICE restarts and left the video
      // sender inactive (candidate saw a black proctor window). Negotiating the m-lines
      // once, up front, makes the toggle instant and reliable.
      micTxRef.current = pc.addTransceiver('audio', { direction: 'sendonly' });
      camTxRef.current = pc.addTransceiver('video', { direction: 'sendonly' });
    };

    const negotiate = async () => {
      const pc = pcRef.current;
      if (!pc) return;
      if (pc.signalingState !== 'stable') { needsNegoRef.current = true; return; }
      try {
        await pc.setLocalDescription(); // implicit createOffer()
        if (pc.localDescription) {
          publishSignal({ sessionKey, sender: 'admin', kind: 'offer', sdp: pc.localDescription });
        }
        setState((s) => (s === 'live' ? s : 'waiting'));
      } catch (err) {
        console.error('[webrtc:admin] negotiation error', err);
      }
    };
    negotiateRef.current = negotiate; // expose to the toggle handlers (component scope)

    const handleAnswer = async (sdp: RTCSessionDescriptionInit, map?: Record<string, 'camera' | 'screen'>) => {
      if (map) streamMapRef.current = map;
      const pc = pcRef.current;
      if (!pc) return;
      if (pc.signalingState !== 'have-local-offer') return; // ignore stale/duplicate answers
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const cand of pendingIceRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (err) {
          console.warn('[webrtc:admin] buffered ICE failed', err);
        }
      }
      pendingIceRef.current = [];
      // Re-announce our media state every time a negotiation settles. This covers
      // the candidate connecting/reconnecting after we already turned media on.
      sendMediaState();
      // A toggle that happened mid-negotiation queued another round — run it now.
      if (needsNegoRef.current) {
        needsNegoRef.current = false;
        negotiate();
      }
    };

    const handleRemoteIce = async (cand: RTCIceCandidateInit) => {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) { pendingIceRef.current.push(cand); return; }
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (err) {
        console.warn('[webrtc:admin] ICE failed', err);
      }
    };

    const client = createStompClient(
      () => {
        // Ignore connects from a client that is no longer the active one. React can
        // mount→unmount→remount this effect (StrictMode, fast route changes), and a
        // STOMP client whose socket was still connecting when we deactivated it may
        // still fire onConnect later — a "zombie". Acting on it would build a peer /
        // subscribe under a dead client and flood dropped publishes. This guard makes
        // the lifecycle robust regardless of how many times the effect re-runs.
        if (clientRef.current !== client) return;

        // onConnect fires on the FIRST connect AND on every auto-reconnect. A new
        // STOMP session has no server-side subscriptions, so we must re-subscribe
        // each time — but the RTCPeerConnection must be built only ONCE, otherwise
        // a reconnect spawns a duplicate peer and wedges the live stream.

        // WebRTC signaling from the candidate (answer + ICE).
        client.subscribe(`/topic/admin/${sessionKey}`, (message) => {
          const msg = parseBody<SignalMessage>(message);
          if (msg.sender !== 'candidate') return;
          if (msg.kind === 'answer' && msg.sdp) {
            handleAnswer(msg.sdp, msg.streamMap).catch((e) => console.error('[webrtc:admin] answer error', e));
          } else if (msg.kind === 'ice-candidate' && msg.candidate) {
            handleRemoteIce(msg.candidate);
          }
        });
        // Chat from the candidate.
        client.subscribe(`/topic/chat/admin/${sessionKey}`, (message) => {
          setMessages((prev) => [...prev, parseBody<ChatMessage>(message)]);
        });

        if (!peerBuiltRef.current) {
          peerBuiltRef.current = true;
          buildPeerAndOffer();
        } else if (pcRef.current && pcRef.current.connectionState !== 'connected') {
          // Reconnected mid-setup: any offer/ICE sent during the outage was dropped.
          // Re-send a fresh offer so the candidate (who also re-subscribed) can finish
          // the handshake. If the media path is already 'connected' we leave it alone.
          negotiate();
        }
      },
      () => setState('failed'),
    );

    clientRef.current = client;
    client.activate();

    return () => {
      // Graceful teardown of admin's own media.
      [micTrackRef, camTrackRef].forEach((r) => { r.current?.stop(); r.current = null; });
      micTxRef.current = null;
      camTxRef.current = null;
      outStreamRef.current?.getTracks().forEach((t) => t.stop());
      outStreamRef.current = null;

      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.onnegotiationneeded = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      peerBuiltRef.current = false;
      clientRef.current?.deactivate();
      clientRef.current = null;
    };
  }, [sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep chat scrolled to the latest message.
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // ── Admin outbound media toggles ────────────────────────────────────────────────
  const ensureOutStream = () => {
    if (!outStreamRef.current) outStreamRef.current = new MediaStream();
    return outStreamRef.current;
  };

  // getUserMedia only exists in a SECURE CONTEXT (HTTPS or localhost). When the
  // admin opens the panel over plain http://<LAN-ip>, navigator.mediaDevices is
  // undefined — surface a clear message instead of a misleading "permission denied".
  const secureMediaAvailable = (): boolean => {
    // Runtime check: the TS types claim mediaDevices is always present, but on an
    // insecure origin the whole object is undefined — hence the `typeof` guard.
    if (typeof navigator.mediaDevices?.getUserMedia === 'function') return true;
    setMediaError(
      'Camera/microphone need a secure (HTTPS) page. Open the admin panel via ' +
      'its https:// address (e.g. https://172.15.0.44:5173/QuickScreen/adm) and ' +
      'accept the certificate warning. The candidate connection stays open.',
    );
    return false;
  };

  const toggleMic = async () => {
    const tx = micTxRef.current;
    if (!tx) return;
    setMediaError('');
    if (!micOn && !secureMediaAvailable()) return;
    if (micOn) {
      // Turn OFF — just stop sending on the pre-negotiated m-line. No renegotiation.
      micTrackRef.current?.stop();
      if (micTrackRef.current) outStreamRef.current?.removeTrack(micTrackRef.current);
      await tx.sender.replaceTrack(null);
      micTrackRef.current = null;
      micOnRef.current = false;
      setMicOn(false);
      sendMediaState();
      negotiateRef.current?.(); // renegotiate so the stopped sender is signalled
    } else {
      try {
        const track = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0];
        ensureOutStream().addTrack(track);
        await tx.sender.replaceTrack(track);
        micTrackRef.current = track;
        micOnRef.current = true;
        setMicOn(true);
        sendMediaState();
        negotiateRef.current?.(); // renegotiate so the new track's SSRC is signalled
      } catch (err) {
        console.error(err);
        setMediaError('Microphone permission denied or unavailable.');
      }
    }
  };

  const toggleCam = async () => {
    const tx = camTxRef.current;
    if (!tx) return;
    setMediaError('');
    if (!camOn && !secureMediaAvailable()) return;
    if (camOn) {
      // Turn OFF — stop sending video on the pre-negotiated m-line. No renegotiation.
      camTrackRef.current?.stop();
      if (camTrackRef.current) outStreamRef.current?.removeTrack(camTrackRef.current);
      await tx.sender.replaceTrack(null);
      camTrackRef.current = null;
      camOnRef.current = false;
      if (selfVideoRef.current) selfVideoRef.current.srcObject = null;
      setCamOn(false);
      sendMediaState();
      negotiateRef.current?.(); // renegotiate so the stopped sender is signalled
    } else {
      try {
        const track = (await navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()[0];
        ensureOutStream().addTrack(track);
        await tx.sender.replaceTrack(track);
        camTrackRef.current = track;
        camOnRef.current = true;
        setCamOn(true);  // self-preview attaches via the camOn effect (element mounts first)
        sendMediaState();
        negotiateRef.current?.(); // renegotiate so the new camera SSRC is signalled to the candidate
      } catch (err) {
        console.error(err);
        setMediaError('Camera permission denied or unavailable.');
      }
    }
  };

  // Stop + detach all admin media. replaceTrack(null) stops sending on the
  // pre-negotiated m-lines (no renegotiation); the media-state signal tells the
  // candidate to drop the floating window before we tear the connection down.
  const handleClose = () => {
    ([[micTxRef, micTrackRef], [camTxRef, camTrackRef]] as const).forEach(([txRef, trRef]) => {
      trRef.current?.stop();
      if (trRef.current) outStreamRef.current?.removeTrack(trRef.current);
      txRef.current?.sender.replaceTrack(null).catch(() => { /* ignore */ });
      trRef.current = null;
    });
    if (selfVideoRef.current) selfVideoRef.current.srcObject = null;
    micOnRef.current = false;
    camOnRef.current = false;
    setMicOn(false);
    setCamOn(false);
    sendMediaState();              // tell the candidate to drop the proctor window now
    setTimeout(onClose, 250);      // let the media-state flush
  };

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    const msg: ChatMessage = { sessionKey, sender: 'admin', name: 'Proctor', text, ts: Date.now() };
    publishSafe(clientRef.current, '/app/chat', JSON.stringify(msg));
    setMessages((prev) => [...prev, msg]); // server only echoes to the candidate
    setDraft('');
  };

  const statusLabel: Record<ConnState, string> = {
    connecting: 'Connecting…',
    waiting: 'Waiting for candidate stream…',
    live: 'Live',
    closed: 'Closed',
    failed: 'Connection failed',
  };
  const controlsReady = state === 'live' || state === 'waiting';

  return (
    <div className="fixed inset-0 bg-slate-950 z-[60] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-slate-900 border-b border-slate-800 text-white gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="text-slate-300 hover:text-white text-sm flex items-center gap-1">
            ← Back to roster
          </button>
          <div className="h-5 w-px bg-slate-700" />
          <div>
            <p className="font-semibold leading-tight">{candidate.name || 'Candidate'}</p>
            <p className="text-xs text-slate-400 font-mono">{candidate.examCode} · {candidate.sessionKey}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {/* Two-way media controls */}
          <button
            onClick={toggleMic}
            disabled={!controlsReady}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition disabled:opacity-40 ${
              micOn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            {micOn ? '🎙️ Mic On' : '🔇 Mic Off'}
          </button>
          <button
            onClick={toggleCam}
            disabled={!controlsReady}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition disabled:opacity-40 ${
              camOn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            {camOn ? '📹 Camera On' : '📷 Camera Off'}
          </button>

          <span className="flex items-center gap-1.5 text-xs font-semibold ml-1">
            {state === 'live' ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            )}
            <span className={state === 'live' ? 'text-rose-400' : 'text-amber-300'}>{statusLabel[state]}</span>
          </span>

          <button onClick={handleClose} className="px-4 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 rounded-lg font-medium transition">
            Close Stream
          </button>
        </div>
      </div>

      {mediaError && (
        <div className="px-6 py-2 bg-rose-900/40 text-rose-200 text-sm border-b border-rose-800">{mediaError}</div>
      )}

      {/* Body: videos + chat sidebar */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative grid grid-cols-1 xl:grid-cols-2 gap-4 p-4 md:p-6 overflow-auto">
          <VideoPanel title="Screen" active={hasScreen} videoRef={screenVideoRef}
            placeholder={state === 'failed' ? 'Stream unavailable' : 'Waiting for screen share…'} muted />
          <VideoPanel title="Camera" active={hasCamera} videoRef={cameraVideoRef}
            placeholder={state === 'failed' ? 'Stream unavailable' : 'Waiting for camera…'} />

          {/* Admin self-preview */}
          {camOn && (
            <div className="absolute bottom-6 left-6 w-40 rounded-lg overflow-hidden border border-slate-700 shadow-xl">
              <div className="px-2 py-0.5 bg-slate-800 text-white text-[10px] font-semibold">You (Proctor)</div>
              <video ref={selfVideoRef} autoPlay playsInline muted className="w-full h-auto bg-black" />
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        <div className="w-full lg:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900 flex flex-col max-h-[40vh] lg:max-h-none">
          <div className="px-4 py-2.5 text-white text-sm font-semibold border-b border-slate-800">Chat</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && <p className="text-center text-xs text-slate-500 mt-4">No messages yet.</p>}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm ${
                  m.sender === 'admin'
                    ? 'bg-rose-600 text-white rounded-br-sm'
                    : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 p-2.5 border-t border-slate-800">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              placeholder="Message the candidate…"
              className="flex-1 px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder-slate-500"
            />
            <button onClick={sendChat} disabled={!draft.trim()}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoPanel({
  title, active, videoRef, placeholder, muted = false,
}: {
  title: string;
  active: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  placeholder: string;
  muted?: boolean;
}) {
  return (
    <div className="relative bg-black rounded-xl overflow-hidden border border-slate-800 min-h-[240px] flex items-center justify-center">
      <span className="absolute top-3 left-3 z-10 px-2 py-0.5 text-xs font-semibold bg-black/60 text-white rounded">{title}</span>
      <video ref={videoRef} autoPlay playsInline muted={muted}
        className={`w-full h-full object-contain ${active ? '' : 'hidden'}`} />
      {!active && <p className="text-slate-500 text-sm">{placeholder}</p>}
    </div>
  );
}
