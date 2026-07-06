import { stompConnection } from '@websocket/stompClient';
import { voiceApi } from '@api/index';
import { playSfx } from '@services/sound';

/**
 * In-game GROUP voice over WebRTC — a mesh "voice room" (like a Discord voice
 * channel) that works for any table size, 2 to 8 players.
 *
 * You tap "Join voice" to enter the room: you acquire your mic and open one
 * RTCPeerConnection to every other player already in the room, and to anyone
 * who joins after you. You hear — and are heard by — everyone in the room, and
 * nobody else. You're only live once you tap Join (mic consent preserved).
 *
 * Signalling rides the shared STOMP connection:
 *   Subscribe: /topic/{kind}/{gameId}/voice
 *   Publish:   /app/{kind}/{gameId}/voice
 * Audio itself is peer-to-peer and never touches our server.
 *
 *   JOIN   → broadcast on entry; a directed JOIN back announces an existing
 *            member to the newcomer. To avoid glare, the LOWER userId offers.
 *   OFFER / ANSWER / ICE → directed to one peer (toUserId set).
 *   LEAVE  → broadcast; peers close my connection.
 *
 * Web-only for now (native returns supported=false until react-native-webrtc).
 * A full mesh is cheap for a handful of players; ~8 is the practical ceiling.
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
  pc:         RTCPeerConnection;
  name:       string;
  audioEl:    HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
  offered:    boolean;
  connected:  boolean;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

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
    if (!sig.fromUserId || sig.fromUserId === this.selfId) return;       // ignore my own
    if (sig.toUserId && sig.toUserId !== this.selfId) return;            // directed elsewhere
    if (this.state !== 'connected') {
      // Not in the room. Still answer a directed JOIN? No — if I haven't joined,
      // I have no mic and shouldn't connect. Ignore everything until I join.
      return;
    }
    const from = sig.fromUserId;
    const name = sig.fromName ?? 'Player';

    switch (sig.type) {
      case 'JOIN': {
        const broadcast = !sig.toUserId;
        if (broadcast) this.send({ type: 'JOIN', toUserId: from });      // announce myself back
        await this.connectToPeer(from, name);
        break;
      }
      case 'OFFER': {
        const peer = this.ensurePeer(from, name);
        if (!peer || !sig.sdp) break;
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
        await this.flushIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.send({ type: 'ANSWER', sdp: answer.sdp, toUserId: from });
        break;
      }
      case 'ANSWER': {
        const peer = this.peers.get(from);
        if (peer && sig.sdp) {
          await peer.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
          await this.flushIce(peer);
        }
        break;
      }
      case 'ICE': {
        const peer = this.peers.get(from);
        if (peer && sig.candidate) {
          if (peer.pc.remoteDescription) {
            try { await peer.pc.addIceCandidate(sig.candidate); }
            catch (e) { console.warn('addIceCandidate failed', e); }
          } else {
            peer.pendingIce.push(sig.candidate);
          }
        }
        break;
      }
      case 'LEAVE':
        this.closePeer(from);
        break;
    }
  }

  /** Ensure a peer connection, then (if I'm the lower id) send the offer. */
  private async connectToPeer(peerId: string, name: string) {
    const peer = this.ensurePeer(peerId, name);
    if (!peer) return;
    // Deterministic initiator avoids both sides offering at once (glare).
    if (this.selfId < peerId && !peer.offered) {
      peer.offered = true;
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.send({ type: 'OFFER', sdp: offer.sdp, toUserId: peerId });
    }
  }

  // ── WebRTC plumbing ─────────────────────────────────────────────────────────

  private ensurePeer(peerId: string, name: string): Peer | null {
    const existing = this.peers.get(peerId);
    if (existing) { existing.name = name; return existing; }
    if (!this.localStream) return null;

    const pc = new RTCPeerConnection({ iceServers: iceServersCache ?? FALLBACK_ICE });
    const peer: Peer = { pc, name, audioEl: null, pendingIce: [], offered: false, connected: false };
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    pc.onicecandidate = ev => {
      if (ev.candidate) this.send({ type: 'ICE', candidate: ev.candidate.toJSON(), toUserId: peerId });
    };
    pc.ontrack = ev => this.attachRemote(peer, ev.streams[0]);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        peer.connected = true;
        // A peer came through — the call works; drop any "couldn't connect".
        this.clearConnectWatchdog();
        if (this.error === 'connect-failed') this.error = null;
        this.emit();
      }
      else if (st === 'failed' || st === 'closed') this.closePeer(peerId);
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
