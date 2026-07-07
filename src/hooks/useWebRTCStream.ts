import { useEffect, useRef, useState, useCallback } from 'react';
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

interface UseWebRTCStreamArgs {
  /** True only when liveStream is on AND the exam is active (streams exist by then). */
  enabled: boolean;
  sessionKey: string;
  studentName: string;
  examCode: string;
  /** Live refs to the exact streams the recorder acquired — reused, not re-requested. */
  cameraStreamRef: React.MutableRefObject<MediaStream | null>;
  screenStreamRef: React.MutableRefObject<MediaStream | null>;
}

export interface AdminMediaState {
  video: boolean;
  audio: boolean;
}

export interface UseWebRTCStreamResult {
  /** Inbound admin media (camera/voice). Null when the admin isn't sending anything. */
  adminStream: MediaStream | null;
  adminMedia: AdminMediaState;
  /** Full chat history for this session (candidate + admin messages, time-ordered). */
  messages: ChatMessage[];
  /** Send a chat message to the admin. */
  sendChat: (text: string) => void;
}

/**
 * Candidate hub for two-way live proctoring.
 *
 *  • Presence  — announces the candidate so the admin roster shows them.
 *  • Outbound  — answers the admin's offer and sends camera + screen (one-way → admin).
 *  • Inbound   — receives the admin's camera/voice once the admin turns them on; the
 *                connection UPGRADES via renegotiation (new offers on the SAME pc),
 *                so the link never drops.
 *  • Chat      — relays text both ways over the same socket.
 *
 * The candidate is always the answerer (never initiates an offer), which sidesteps
 * glare entirely — incoming offers are simply applied in order.
 */
export function useWebRTCStream({
  enabled,
  sessionKey,
  studentName,
  examCode,
  cameraStreamRef,
  screenStreamRef,
}: UseWebRTCStreamArgs): UseWebRTCStreamResult {
  const clientRef = useRef<Client | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const tracksAddedRef = useRef(false);                 // candidate cam/screen added once
  const streamMapRef = useRef<Record<string, 'camera' | 'screen'>>({});
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const negChainRef = useRef<Promise<void>>(Promise.resolve()); // serialize offers
  const adminTracksRef = useRef<Set<MediaStreamTrack>>(new Set()); // admin's inbound tracks
  const adminSessionRef = useRef<string | null>(null);             // current admin viewing-session id

  const [adminStream, setAdminStream] = useState<MediaStream | null>(null);
  const [adminMedia, setAdminMedia] = useState<AdminMediaState>({ video: false, audio: false });
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const metaRef = useRef({ sessionKey, studentName, examCode });
  metaRef.current = { sessionKey, studentName, examCode };

  // ── Chat send (stable identity for consumers) ───────────────────────────────
  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const msg: ChatMessage = {
      sessionKey: metaRef.current.sessionKey,
      sender: 'candidate',
      name: metaRef.current.studentName,
      text: trimmed,
      ts: Date.now(),
    };
    publishSafe(clientRef.current, '/app/chat', JSON.stringify(msg));
    // The server only echoes to the admin, so reflect our own message locally.
    setMessages((prev) => [...prev, msg]);
  }, []);

  useEffect(() => {
    if (!enabled || !sessionKey) {
      // Reset inbound state when proctoring is off (e.g. exam ended).
      setAdminStream(null);
      setAdminMedia({ video: false, audio: false });
      return;
    }

    const publishSignal = (msg: SignalMessage) => {
      publishSafe(clientRef.current, '/app/signal', JSON.stringify(msg));
    };

    // Rebuild the admin MediaStream from every live inbound track. Whether the
    // floating window is VISIBLE is decided separately by the explicit 'media-state'
    // signal (see the subscription below) — not inferred from these tracks, which
    // mute/unmute on unpredictable timing. Here we only keep the stream's contents
    // current so the <video> element always has the freshest tracks to render.
    const rebuildAdminStream = () => {
      const live = [...adminTracksRef.current].filter((t) => t.readyState === 'live');
      setAdminStream(live.length ? new MediaStream(live) : null);
    };

    const closePeer = () => {
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      tracksAddedRef.current = false;
      pendingIceRef.current = [];
      adminTracksRef.current.clear();
      setAdminStream(null);
      setAdminMedia({ video: false, audio: false });
    };

    const ensurePeer = (): RTCPeerConnection => {
      if (pcRef.current) return pcRef.current;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          publishSignal({
            sessionKey: metaRef.current.sessionKey,
            sender: 'candidate',
            kind: 'ice-candidate',
            candidate: e.candidate.toJSON(),
          });
        }
      };

      // Admin media (camera/voice) arrives here. Every track the candidate RECEIVES
      // belongs to the admin (the candidate only sends). Keep them in adminStream;
      // visibility is governed by the 'media-state' signal, not by these tracks.
      pc.ontrack = (e) => {
        adminTracksRef.current.add(e.track);
        e.track.addEventListener('ended', () => {
          adminTracksRef.current.delete(e.track);
          rebuildAdminStream();
        });
        rebuildAdminStream();
      };

      pc.onconnectionstatechange = () => {
        console.log('[webrtc:candidate] connection state →', pc.connectionState);
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
          // Admin closed the stream — drop the floating window.
          setAdminStream(null);
          setAdminMedia({ video: false, audio: false });
        }
      };
      return pc;
    };

    // Apply an offer (initial OR renegotiation) without tearing down the connection.
    const handleOffer = (offer: RTCSessionDescriptionInit) => {
      negChainRef.current = negChainRef.current
        .then(async () => {
          const pc = ensurePeer();
          await pc.setRemoteDescription(new RTCSessionDescription(offer));

          // Attach our camera + screen exactly once (first negotiation).
          if (!tracksAddedRef.current) {
            const camera = cameraStreamRef.current;
            const screen = screenStreamRef.current;
            streamMapRef.current = {};
            if (camera) {
              streamMapRef.current[camera.id] = 'camera';
              camera.getTracks().forEach((track) => pc.addTrack(track, camera));
            }
            if (screen) {
              streamMapRef.current[screen.id] = 'screen';
              screen.getTracks().forEach((track) => pc.addTrack(track, screen));
            }
            tracksAddedRef.current = true;
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          publishSignal({
            sessionKey: metaRef.current.sessionKey,
            sender: 'candidate',
            kind: 'answer',
            sdp: answer,
            streamMap: streamMapRef.current,
          });

          for (const cand of pendingIceRef.current) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (err) {
              console.warn('[webrtc:candidate] buffered ICE failed', err);
            }
          }
          pendingIceRef.current = [];

          rebuildAdminStream();
        })
        .catch((err) => console.error('[webrtc:candidate] negotiation error', err));
    };

    const handleRemoteIce = async (cand: RTCIceCandidateInit) => {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) { pendingIceRef.current.push(cand); return; }
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (err) {
        console.warn('[webrtc:candidate] failed to add ICE', err);
      }
    };

    // ── Connect ──────────────────────────────────────────────────────────────
    const client = createStompClient(() => {
      // Ignore connects from a client that is no longer the active one (a "zombie"
      // left by a mount→unmount→remount whose socket was still connecting when we
      // deactivated it). Acting on it would double-subscribe and re-join presence
      // under a dead client.
      if (clientRef.current !== client) return;

      // WebRTC signaling addressed to this candidate.
      client.subscribe(`/topic/candidate/${sessionKey}`, (message) => {
        const msg = parseBody<SignalMessage>(message);
        if (msg.sender !== 'admin') return;

        // A new admin viewing session = the admin reopened the viewer with a FRESH
        // peer connection. Only an OFFER starts a session, so we adopt the new id
        // there and tear down our stale peer; the offer then builds a clean matching
        // one. This makes "close stream → reopen" reliably show the candidate again
        // instead of hanging on "Waiting for candidate stream…". Non-offer messages
        // bearing a different (stale) session id are ignored so a late ICE candidate
        // from the previous session can't destroy the fresh peer.
        if (msg.session && msg.session !== adminSessionRef.current) {
          if (msg.kind !== 'offer') return;
          if (adminSessionRef.current !== null) closePeer(); // not the very first offer
          adminSessionRef.current = msg.session;
        }

        if (msg.kind === 'offer' && msg.sdp) handleOffer(msg.sdp);
        else if (msg.kind === 'ice-candidate' && msg.candidate) handleRemoteIce(msg.candidate);
        else if (msg.kind === 'media-state' && msg.media) {
          // Authoritative show/hide for the floating proctor window.
          setAdminMedia({ video: !!msg.media.video, audio: !!msg.media.audio });
        }
      });

      // Chat addressed to this candidate.
      client.subscribe(`/topic/chat/candidate/${sessionKey}`, (message) => {
        const msg = parseBody<ChatMessage>(message);
        setMessages((prev) => [...prev, msg]);
      });

      // Presence.
      const presence: PresencePayload = {
        sessionKey: metaRef.current.sessionKey,
        name: metaRef.current.studentName,
        examCode: metaRef.current.examCode,
        status: 'active',
      };
      publishSafe(client, '/app/presence/join', JSON.stringify(presence));
    });

    clientRef.current = client;
    client.activate();

    return () => {
      const c = clientRef.current;
      if (c?.connected) {
        const leave: PresencePayload = {
          sessionKey: metaRef.current.sessionKey,
          name: metaRef.current.studentName,
          examCode: metaRef.current.examCode,
          status: 'left',
        };
        c.publish({ destination: '/app/presence/leave', body: JSON.stringify(leave) });
      }
      closePeer();
      c?.deactivate();
      clientRef.current = null;
    };
  }, [enabled, sessionKey, cameraStreamRef, screenStreamRef]);

  return { adminStream, adminMedia, messages, sendChat };
}
