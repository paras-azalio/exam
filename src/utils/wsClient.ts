import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { BACKEND_URL } from '../config';

/**
 * Shared STOMP-over-SockJS plumbing for the live-proctoring feature.
 *
 * Both the candidate hook (useWebRTCStream) and the admin components
 * (LiveParticipantsModal / LiveViewer) open their own STOMP client through
 * createStompClient(), so each is self-contained and independently testable.
 *
 * The socket connects to {BACKEND_URL}/ws — the same base URL the REST calls
 * use, so it inherits the "/QuickScreen" context-path automatically.
 */

// ── Shared message shapes ─────────────────────────────────────────────────────

export interface PresencePayload {
  sessionKey: string;
  name: string;
  examCode: string;
  status: 'active' | 'submitting' | 'left';
}

export type SignalKind = 'offer' | 'answer' | 'ice-candidate' | 'media-state';

export interface SignalMessage {
  sessionKey: string;
  sender: 'admin' | 'candidate';
  kind: SignalKind;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  /** Candidate → admin only: maps each MediaStream id to its role. */
  streamMap?: Record<string, 'camera' | 'screen'>;
  /**
   * Admin → candidate only, for kind 'media-state': the admin's current outbound
   * media. The candidate shows/hides the floating proctor window from THIS rather
   * than inferring it from track mute/direction events (which are timing-fragile).
   */
  media?: { video: boolean; audio: boolean };
  /**
   * Admin → candidate: a unique id for the admin's CURRENT viewing session. The
   * admin builds a fresh RTCPeerConnection every time the viewer opens, so a new
   * id signals the candidate to tear down its stale peer and build a matching fresh
   * one. It stays constant across renegotiations/ICE-restarts within one viewing.
   */
  session?: string;
}

export interface ChatMessage {
  sessionKey: string;
  sender: 'admin' | 'candidate';
  name: string;
  text: string;
  ts: number;
}

/**
 * ICE servers for WebRTC.
 *
 * STUN alone only works when both peers can reach each other DIRECTLY (same LAN with
 * the firewall open, or one side publicly reachable). The moment the candidate and
 * admin are on different networks — or behind symmetric NAT, or on a LAN that blocks
 * peer-to-peer / has no internet to reach the public STUN — ICE will end in `failed`.
 * That case REQUIRES a TURN server, which relays the media.
 *
 * Add a TURN server without touching code by setting these in your frontend .env:
 *   VITE_TURN_URL=turn:turn.yourdomain.com:3478
 *   VITE_TURN_USERNAME=...     (or short-lived credentials)
 *   VITE_TURN_CREDENTIAL=...
 */
const env = import.meta.env as Record<string, string | undefined>;
const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
if (env.VITE_TURN_URL) {
  iceServers.push({
    urls: env.VITE_TURN_URL,
    username: env.VITE_TURN_USERNAME,
    credential: env.VITE_TURN_CREDENTIAL,
  });
}
export const RTC_CONFIG: RTCConfiguration = { iceServers };

/**
 * Resolve the SockJS endpoint to an ABSOLUTE http(s) URL.
 *
 * BACKEND_URL may be:
 *   • absolute  ("http://host:8080/QuickScreen")  → used verbatim
 *   • relative  ("/QuickScreen", the proxy setup) → joined to the page origin,
 *     so an HTTPS page produces an https:// SockJS URL (no mixed content).
 * SockJS requires an absolute URL, hence this helper.
 */
function resolveSockJsUrl(): string {
  const base = /^https?:\/\//i.test(BACKEND_URL)
    ? BACKEND_URL
    : `${window.location.origin}${BACKEND_URL}`;
  return `${base}/ws`;
}

/**
 * Builds a configured (not yet activated) STOMP client.
 * Call client.activate() to connect and client.deactivate() to clean up.
 */
export function createStompClient(onConnect: () => void, onError?: (msg: string) => void): Client {
  const client = new Client({
    // SockJS needs an absolute http(s) URL, not ws://
    webSocketFactory: () => new SockJS(resolveSockJsUrl()),
    reconnectDelay: 4000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect,
    onStompError: (frame) => {
      console.error('[ws] STOMP error', frame.headers['message'], frame.body);
      onError?.(frame.headers['message'] ?? 'WebSocket error');
    },
    onWebSocketError: (evt) => {
      console.error('[ws] socket error', evt);
      onError?.('WebSocket connection failed');
    },
  });
  return client;
}

/** Helper: parse a STOMP message body as JSON of type T. */
export function parseBody<T>(message: IMessage): T {
  return JSON.parse(message.body) as T;
}

/**
 * Publish ONLY when the STOMP client is actually connected.
 *
 * `@stomp/stompjs` v7 throws `TypeError("There is no underlying STOMP
 * connection")` the instant you call `client.publish()` while the client is not
 * connected — and the optional-chaining guard (`client?.publish`) does NOT catch
 * this, because it only guards a *null* client, not a live-but-disconnected one.
 *
 * WebRTC callbacks (onicecandidate / onnegotiationneeded / restartIce) fire
 * asynchronously and routinely land during the auto-reconnect window
 * (reconnectDelay) or a brief heartbeat drop. Without this guard each such call
 * throws, aborts the negotiation, and the live stream silently fails to connect.
 *
 * Returns true if the message was actually sent, false if it was dropped because
 * the socket was down (the caller can re-send on the next onConnect if needed).
 */
export function publishSafe(client: Client | null, destination: string, body: string): boolean {
  if (client?.connected) {
    client.publish({ destination, body });
    return true;
  }
  console.warn(`[ws] dropped publish to ${destination} — STOMP not connected`);
  return false;
}
