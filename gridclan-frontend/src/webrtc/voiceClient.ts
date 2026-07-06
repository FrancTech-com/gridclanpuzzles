import { stompConnection } from '@websocket/stompClient';
import { voiceApi } from '@api/index';
import { playSfx } from '@services/sound';

/**
 * In-game GROUP voice over WebRTC — a mesh "voice room" (like a Discord voice
 * channel) that works for any table size, 2 to 8 players.
 *
 * You tap "Join voice" to enter the room: you acquire your mic and open one
 * RTCPeerConnection to every other player in the room. You hear — and are heard
 * by — everyone in the room, and nobody else. You're only live once you tap Join
 * (mic consent preserved).
 *
 * Reliability (this is what makes a mesh actually work at 6-8 people):
 *   • PERFECT NEGOTIATION — each pair has a deterministic polite/impolite side,
 *     so simultaneous offers (glare) never wedge a connection.
 *   • ICE RESTART on failure instead of dropping the peer — a transient TURN/NAT
 *     blip recovers instead of permanently fragmenting the mesh.
 *   • PERIODIC RE-ANNOUNCE — a lightweight JOIN heartbeat rediscovers anyone we
 *     missed (e.g. a peer stuck on the mic-permission prompt when we joined).
 *
 * Signalling rides the shared STOMP connection:
 *   Subscribe: /topic/{kind}/{gameId}/voice
 *   Publish:   /app/{kind}/{gameId}/voice
 *   JOIN (broadcast, or directed to announce back), OFFER/ANSWER/ICE (directed
 *   via toUserId), LEAVE (broadcast). Audio never touches our server.
 *
 * Web-only for now (native returns supported=false until react-native-webrtc).
 */

export type VoiceState = 'idle' | 'connecting' | 'connected';

export interface VoiceStatus {
  state:        VoiceState;
  participants: string[];   // names of the other people currently in the room
  muted:        boolean;
  supported:    boolean;
  error:        'signal-down' | 'mic-denied' | 'connect-failed' | null;
}

/** How long to wait for at least one peer to actually connect before giving up.
 *  WebRTC + TURN normally connects within a few seconds; 15s is a safe ceiling
 *  before we tell the user the call couldn't be established (usually no TURN). */
const CONNECT_TIMEOUT_MS = 15_000;

type StatusHandler = (s: VoiceStatus) => void;

type SignalType = 'JOIN' | 'LEAVE' | 'OFFER' | 'ANSWER' | 'ICE';
interface VoiceSignal {
  type:        SignalType;
  sdp?:        string;
  candidate?:  any;
  toUserId?:   string | null;
  fromUserId?: string;
  fromName?:   string;
}

interface Peer {
  pc:          RTCPeerConnection;
  name:        string;
  polite:      boolean;                 // perfect-negotiation role
  makingOffer: boolean;
  ignoreOffer: boolean;
  audioEl:     HTMLAudioElement | null;
  pendingIce:  RTCIceCandidateInit[];
  connected:   boolean;
  restarts:    number;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const MAX_ICE_RESTARTS = 3;
const REANNOUNCE_MS = 12_000;

let iceServersCache: RTCIceServer[] | null = null;
async function getIceServers(): Promise<RTCIceServer[]> {
  if (iceServersCache) return iceServersCache;
  try {
    const res = await voiceApi.iceServers();
    if (Array.isArray(res.data) && res.data.length > 0) {
      iceServersCache = res.data as RTCIceServer[];
      return iceServersCache;
    }
  } catch { /* fall through to STUN-only */ }
  return FALLBACK_ICE;
}

const supported = (): boolean =>
  typeof RTCPeerConnection !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

class VoiceClient {
  private kind   = '';
  private gameId = '';
  private selfId = '';
  private onStatus: StatusHandler | null = null;
  private unsub:    (() => void) | null  = null;

  private localStream: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private reannounce: ReturnType<typeof setInterval> | null = null;

  private state: VoiceState = 'idle';
  private muted = false;
  private error: 'signal-down' | 'mic-denied' | 'connect-failed' | null = null;
  private gen   = 0;   // bumped on every start/stop to cancel stale async work
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Bind to one game's voice topic. Call once when the game screen mounts. */
  async start(kind: string, gameId: string, selfUserId: string, onStatus: StatusHandler) {
    this.stop();
    const gen = ++this.gen;
    this.kind = kind; this.gameId = gameId; this.selfId = selfUserId;
    this.onStatus = onStatus;
    this.emit();
    if (!supported()) return;

    const unsub = await stompConnection.subscribe(
      `/topic/${kind}/${gameId}/voice`,
      frame => {
        try { this.onSignal(JSON.parse(frame.body) as VoiceSignal); }
        catch (e) { console.warn('Voice signal parse error', e); }
      },
    );
    if (gen !== this.gen) { unsub(); return; }
    this.unsub = unsub;
  }

  /** Tear down on screen unmount (leaves the room if we were in it). */
  stop() {
    this.gen++;
    if (this.state !== 'idle') this.send({ type: 'LEAVE' });
    this.teardown();
    this.unsub?.();
    this.unsub = null;
    this.onStatus = null;
    this.state = 'idle';
    this.error = null;
  }

  // ── User actions ────────────────────────────────────────────────────────────

  /** Join the voice room: acquire mic, announce myself, connect to everyone. */
  async joinRoom() {
    if (!supported() || this.state !== 'idle') return;
    const gen = this.gen;
    this.state = 'connecting';
    this.error = null;
    this.emit();

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      console.warn('Microphone permission denied / unavailable', e);
      if (gen !== this.gen) return;
      this.error = 'mic-denied';
      this.state = 'idle';
      this.emit();
      return;
    }
    if (gen !== this.gen) { this.localStream.getTracks().forEach(t => t.stop()); return; }

    // Warm the STUN/TURN cache before any peer connection is built, so the very
    // first peer also gets TURN (mobile NAT needs it).
    await getIceServers();
    if (gen !== this.gen) { this.localStream.getTracks().forEach(t => t.stop()); return; }

    if (!this.send({ type: 'JOIN' })) {
      this.error = 'signal-down';
      this.teardown();
      this.state = 'idle';
      this.emit();
      setTimeout(() => { if (this.error === 'signal-down') { this.error = null; this.emit(); } }, 4000);
      return;
    }
    this.state = 'connected';
    playSfx('tap');
    // Rediscover anyone we missed (mic-prompt races, dropped links).
    this.reannounce = setInterval(() => {
      if (this.state === 'connected') this.send({ type: 'JOIN' });
    }, REANNOUNCE_MS);
    this.emit();
  }

  /** Leave the voice room. */
  leaveRoom() {
    if (this.state === 'idle') return;
    this.send({ type: 'LEAVE' });
    this.teardown();
    this.state = 'idle';
    this.error = null;
    this.emit();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    this.emit();
  }

  // ── Signal handling ───────────────────────────────────────────────────────

  private async onSignal(sig: VoiceSignal) {
    if (!sig.fromUserId || sig.fromUserId === this.selfId) return;   // ignore my own
    if (sig.toUserId && sig.toUserId !== this.selfId) return;        // directed elsewhere
    if (this.state !== 'connected') return;                          // not in the room yet
    const from = sig.fromUserId;
    const name = sig.fromName ?? 'Player';

    switch (sig.type) {
      case 'JOIN': {
        const existing = this.peers.get(from);
        // Already talking to them → ignore the heartbeat (keeps steady state quiet).
        if (existing && existing.pc.connectionState === 'connected') break;
        if (!sig.toUserId) this.send({ type: 'JOIN', toUserId: from });   // announce back
        this.ensurePeer(from, name);   // adding tracks kicks off negotiation
        break;
      }
      case 'OFFER':
      case 'ANSWER':
        if (sig.sdp) await this.handleDescription(from, name, sig.type === 'OFFER' ? 'offer' : 'answer', sig.sdp);
        break;
      case 'ICE':
        if (sig.candidate) await this.handleIce(from, name, sig.candidate);
        break;
      case 'LEAVE':
        this.closePeer(from);
        break;
    }
  }

  /** Perfect-negotiation description handler (SDP offer/answer). */
  private async handleDescription(from: string, name: string, type: 'offer' | 'answer', sdp: string) {
    const peer = this.ensurePeer(from, name);
    if (!peer) return;
    const pc = peer.pc;
    const collision = type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
    peer.ignoreOffer = !peer.polite && collision;
    if (peer.ignoreOffer) return;     // impolite side keeps its own offer

    try {
      await pc.setRemoteDescription({ type, sdp });
      await this.flushIce(peer);
      if (type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ type: 'ANSWER', sdp: pc.localDescription?.sdp, toUserId: from });
      }
    } catch (e) {
      console.warn('Voice negotiation error', e);
    }
  }

  private async handleIce(from: string, name: string, candidate: RTCIceCandidateInit) {
    const peer = this.ensurePeer(from, name);
    if (!peer) return;
    if (peer.pc.remoteDescription) {
      try { await peer.pc.addIceCandidate(candidate); }
      catch (e) { if (!peer.ignoreOffer) console.warn('addIceCandidate failed', e); }
    } else {
      peer.pendingIce.push(candidate);   // queue until the remote description is set
    }
  }

  // ── WebRTC plumbing ─────────────────────────────────────────────────────────

  private ensurePeer(peerId: string, name: string): Peer | null {
    const existing = this.peers.get(peerId);
    if (existing) { existing.name = name; return existing; }
    if (!this.localStream) return null;

    const pc = new RTCPeerConnection({ iceServers: iceServersCache ?? FALLBACK_ICE });
    const peer: Peer = {
      pc, name,
      polite: this.selfId > peerId,   // deterministic: higher id is polite
      makingOffer: false, ignoreOffer: false,
      audioEl: null, pendingIce: [], connected: false, restarts: 0,
    };
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    // Perfect negotiation: react to the browser's own "renegotiate" signal.
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;   // a remote offer arrived first
        await pc.setLocalDescription(offer);
        this.send({ type: 'OFFER', sdp: pc.localDescription?.sdp, toUserId: peerId });
      } catch (e) {
        console.warn('Voice onnegotiationneeded error', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ev => {
      if (ev.candidate) this.send({ type: 'ICE', candidate: ev.candidate.toJSON(), toUserId: peerId });
    };
    pc.ontrack = ev => this.attachRemote(peer, ev.streams[0]);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        peer.connected = true;
        peer.restarts  = 0;
        // A peer came through — the call works; drop any "couldn't connect".
        this.clearConnectWatchdog();
        if (this.error === 'connect-failed') this.error = null;
        this.emit();
      }
      else if (st === 'disconnected') { if (peer.connected) { peer.connected = false; this.emit(); } }
      else if (st === 'failed') {
        peer.connected = false;
        this.emit();
        // Recover instead of dropping the peer — a mesh must self-heal.
        if (peer.restarts < MAX_ICE_RESTARTS) {
          peer.restarts++;
          try { pc.restartIce(); } catch { /* older engines: onnegotiationneeded still fires */ }
        } else {
          this.closePeer(peerId);
        }
      }
    };

    this.peers.set(peerId, peer);
    // We now have someone to reach — start the watchdog that flags a failed call
    // if nobody actually connects in time (the classic no-TURN-relay symptom).
    this.armConnectWatchdog();
    // Make sure the real ICE servers are loaded for the next connection.
    if (!iceServersCache) getIceServers().catch(() => {});
    this.emit();
    return peer;
  }

  private attachRemote(peer: Peer, stream: MediaStream) {
    if (typeof document === 'undefined') return;   // web-only audio sink
    if (!peer.audioEl) {
      peer.audioEl = document.createElement('audio');
      peer.audioEl.autoplay = true;
      peer.audioEl.style.display = 'none';
      document.body.appendChild(peer.audioEl);
    }
    peer.audioEl.srcObject = stream;
    peer.audioEl.play?.().catch(() => { /* autoplay may need a user gesture */ });
  }

  private async flushIce(peer: Peer) {
    const queued = peer.pendingIce;
    peer.pendingIce = [];
    for (const c of queued) {
      try { await peer.pc.addIceCandidate(c); }
      catch (e) { console.warn('flush addIceCandidate failed', e); }
    }
  }

  private closePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    try { peer.pc.close(); } catch { /* noop */ }
    if (peer.audioEl) { peer.audioEl.srcObject = null; peer.audioEl.remove(); }
    this.peers.delete(peerId);
    this.emit();
  }

  private teardown() {
    this.clearConnectWatchdog();
    if (this.reannounce) { clearInterval(this.reannounce); this.reannounce = null; }
    for (const id of Array.from(this.peers.keys())) this.closePeer(id);
    this.peers.clear();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.muted = false;
  }

  /** Arm (once) the timer that flags a failed call if no peer connects in time. */
  private armConnectWatchdog() {
    if (this.connectWatchdog) return;
    this.connectWatchdog = setTimeout(() => {
      this.connectWatchdog = null;
      const anyConnected = Array.from(this.peers.values()).some(p => p.connected);
      // In the room, peers were attempted, but none actually came through.
      if (this.state === 'connected' && this.peers.size > 0 && !anyConnected) {
        this.error = 'connect-failed';
        this.emit();
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectWatchdog() {
    if (this.connectWatchdog) { clearTimeout(this.connectWatchdog); this.connectWatchdog = null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(sig: Pick<VoiceSignal, 'type' | 'sdp' | 'candidate' | 'toUserId'>): boolean {
    return stompConnection.publish(`/app/${this.kind}/${this.gameId}/voice`, JSON.stringify(sig));
  }

  private emit() {
    const participants = Array.from(this.peers.values())
      .filter(p => p.connected)
      .map(p => p.name);
    this.onStatus?.({
      state:        this.state,
      participants,
      muted:        this.muted,
      supported:    supported(),
      error:        this.error,
    });
  }
}

// One voice room at a time per app session.
export const voiceClient = new VoiceClient();
