import { stompConnection } from '@websocket/stompClient';
import { voiceApi } from '@api/index';
import { playSfx } from '@services/sound';

/**
 * Friend-to-friend in-game voice over WebRTC.
 *
 * Signalling rides the shared STOMP connection:
 *   Subscribe: /topic/{kind}/{gameId}/voice
 *   Publish:   /app/{kind}/{gameId}/voice
 * Audio itself is peer-to-peer (RTCPeerConnection) — it never touches our server.
 *
 * Phase 1 is web-only: it uses the browser's native WebRTC. On native (Expo)
 * `RTCPeerConnection` is absent, so `isSupported` is false and the UI shows a
 * "voice on web for now" hint instead of a broken button. Native support arrives
 * with react-native-webrtc in a later phase — the signalling stays identical.
 *
 * ICE servers (STUN + TURN) come from the backend (/voice/ice-servers) so the
 * relay can be swapped via env without a release. TURN matters here: on
 * carrier-grade NAT (most mobile data) a direct P2P path is blocked and calls
 * only connect by relaying through TURN.
 */

export type VoiceState =
  | 'idle'        // nothing happening
  | 'requesting'  // I tapped the mic, waiting for my friend to accept
  | 'incoming'    // my friend rang — show Accept / Decline
  | 'connecting'  // handshake in progress
  | 'connected';  // live call

export interface VoiceStatus {
  state:     VoiceState;
  peerName:  string | null;  // who rang me / who I'm talking to
  muted:     boolean;
  supported: boolean;
  /** Transient user-facing problem (e.g. signalling socket reconnecting). */
  error:     'signal-down' | null;
}

type StatusHandler = (s: VoiceStatus) => void;

type SignalType = 'REQUEST' | 'ACCEPT' | 'DECLINE' | 'OFFER' | 'ANSWER' | 'ICE' | 'HANGUP';
interface VoiceSignal {
  type:        SignalType;
  sdp?:        string;
  candidate?:  any;
  fromUserId?: string;
  fromName?:   string;
}

// Fallback if the config endpoint is unreachable — STUN-only (P2P paths only).
const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

// Fetched once per session; all calls share it.
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
  private kind        = '';
  private gameId      = '';
  private selfId      = '';
  private onStatus:   StatusHandler | null = null;
  private unsub:      (() => void) | null  = null;

  private pc:         RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private audioEl:    HTMLAudioElement | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];

  private state:    VoiceState = 'idle';
  private peerName: string | null = null;
  private muted     = false;
  private error:    'signal-down' | null = null;
  private gen       = 0;   // bumped on every start/stop to cancel stale async work

  // Unanswered rings and stuck handshakes end themselves instead of showing
  // "Ringing…" / "Connecting…" forever.
  private static readonly RING_TIMEOUT_MS    = 30_000;
  private static readonly CONNECT_TIMEOUT_MS = 30_000;
  private stateTimer:   ReturnType<typeof setTimeout>  | null = null;
  private ringSfxTimer: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Bind to one game's voice topic. Call once when the game screen mounts. */
  async start(kind: string, gameId: string, selfUserId: string, onStatus: StatusHandler) {
    this.stop();
    const gen = ++this.gen;
    this.kind = kind; this.gameId = gameId; this.selfId = selfUserId;
    this.onStatus = onStatus;
    this.emit();
    if (!supported()) return;  // signalling pointless without WebRTC

    const unsub = await stompConnection.subscribe(
      `/topic/${kind}/${gameId}/voice`,
      frame => {
        try { this.onSignal(JSON.parse(frame.body) as VoiceSignal); }
        catch (e) { console.warn('Voice signal parse error', e); }
      },
    );
    // If we were stopped/restarted while subscribing, drop this stale subscription.
    if (gen !== this.gen) { unsub(); return; }
    this.unsub = unsub;
  }

  /** Tear down on screen unmount. */
  stop() {
    this.gen++;
    this.clearTimers();
    this.teardownCall();
    this.unsub?.();
    this.unsub = null;
    this.onStatus = null;
    this.state = 'idle';
    this.peerName = null;
    this.error = null;
  }

  // ── User actions ────────────────────────────────────────────────────────────

  /** Ring my friend. If the signalling socket is down (it auto-reconnects with
   *  a fresh token) tell the user to retry shortly instead of silently no-oping. */
  requestVoice() {
    if (!supported() || this.state !== 'idle') return;
    if (!this.send({ type: 'REQUEST' })) {
      console.warn('Voice ring not sent — signalling socket is down');
      this.error = 'signal-down';
      this.emit();
      setTimeout(() => {
        if (this.error) { this.error = null; this.emit(); }
      }, 4000);
      return;
    }
    this.error = null;
    this.state = 'requesting';
    this.clearTimers();
    this.stateTimer = setTimeout(() => {
      if (this.state === 'requesting') this.hangup();   // nobody picked up
    }, VoiceClient.RING_TIMEOUT_MS);
    this.emit();
  }

  /** Accept an incoming ring → I'm the callee, wait for the offer. */
  async accept() {
    if (this.state !== 'incoming') return;
    this.clearTimers();
    const ok = await this.ensureMicAndPc();
    if (!ok) { this.hangup(); return; }
    this.state = 'connecting';
    this.armConnectTimeout();
    this.send({ type: 'ACCEPT' });
    this.emit();
  }

  /** Decline an incoming ring. */
  decline() {
    if (this.state !== 'incoming') return;
    this.send({ type: 'DECLINE' });
    this.reset();
  }

  /** End / cancel the call from either side. */
  hangup() {
    if (this.state === 'idle') return;
    this.send({ type: 'HANGUP' });
    this.reset();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    this.emit();
  }

  // ── Signal handling ───────────────────────────────────────────────────────

  private async onSignal(sig: VoiceSignal) {
    if (!sig.fromUserId || sig.fromUserId === this.selfId) return;  // ignore my own frames

    switch (sig.type) {
      case 'REQUEST':
        if (this.state === 'idle') {
          this.peerName = sig.fromName ?? 'Your friend';
          this.state = 'incoming';
          this.clearTimers();
          playSfx('ring');
          this.ringSfxTimer = setInterval(() => playSfx('ring'), 3000);
          this.stateTimer = setTimeout(() => {
            if (this.state === 'incoming') this.reset();   // missed call
          }, VoiceClient.RING_TIMEOUT_MS);
          this.emit();
        }
        break;

      case 'ACCEPT':
        // My friend accepted my ring → I'm the caller, send the offer.
        if (this.state === 'requesting') {
          this.clearTimers();
          const ok = await this.ensureMicAndPc();
          if (!ok) { this.hangup(); break; }
          this.peerName = sig.fromName ?? this.peerName;
          this.state = 'connecting';
          this.armConnectTimeout();
          this.emit();
          const offer = await this.pc!.createOffer();
          await this.pc!.setLocalDescription(offer);
          this.send({ type: 'OFFER', sdp: offer.sdp });
        }
        break;

      case 'DECLINE':
        if (this.state === 'requesting') this.reset();
        break;

      case 'OFFER':
        // I'm the callee — answer it. (mic+pc already set up in accept())
        if (this.pc && sig.sdp) {
          await this.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
          await this.flushIce();
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.send({ type: 'ANSWER', sdp: answer.sdp });
        }
        break;

      case 'ANSWER':
        if (this.pc && sig.sdp) {
          await this.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
          await this.flushIce();
        }
        break;

      case 'ICE':
        if (sig.candidate) {
          if (this.pc?.remoteDescription) {
            try { await this.pc.addIceCandidate(sig.candidate); }
            catch (e) { console.warn('addIceCandidate failed', e); }
          } else {
            this.pendingIce.push(sig.candidate);  // queue until remote desc is set
          }
        }
        break;

      case 'HANGUP':
        if (this.state !== 'idle') this.reset();
        break;
    }
  }

  // ── WebRTC plumbing ─────────────────────────────────────────────────────────

  private async ensureMicAndPc(): Promise<boolean> {
    if (this.pc) return true;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      console.warn('Microphone permission denied / unavailable', e);
      return false;
    }
    const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    pc.onicecandidate = ev => {
      if (ev.candidate) this.send({ type: 'ICE', candidate: ev.candidate.toJSON() });
    };
    pc.ontrack = ev => this.attachRemote(ev.streams[0]);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected' && this.state !== 'connected') {
        this.clearTimers();
        this.state = 'connected';
        this.emit();
      }
      // 'disconnected' is often transient (a network blip WebRTC recovers from
      // by itself) — only tear down on definitive 'failed' / 'closed'.
      else if (st === 'failed' || st === 'closed') {
        if (this.state !== 'idle') this.reset();
      }
    };

    this.pc = pc;
    return true;
  }

  private attachRemote(stream: MediaStream) {
    if (typeof document === 'undefined') return;  // web-only audio sink
    if (!this.audioEl) {
      this.audioEl = document.createElement('audio');
      this.audioEl.autoplay = true;
      this.audioEl.style.display = 'none';
      document.body.appendChild(this.audioEl);
    }
    this.audioEl.srcObject = stream;
    this.audioEl.play?.().catch(() => { /* autoplay may need a user gesture */ });
  }

  private async flushIce() {
    if (!this.pc) return;
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const c of queued) {
      try { await this.pc.addIceCandidate(c); }
      catch (e) { console.warn('flush addIceCandidate failed', e); }
    }
  }

  private teardownCall() {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.pendingIce = [];
    if (this.pc) { try { this.pc.close(); } catch { /* noop */ } this.pc = null; }
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl.remove();
      this.audioEl = null;
    }
    this.muted = false;
  }

  /** Local teardown + back to idle, keeping the topic subscription alive. */
  private reset() {
    this.clearTimers();
    this.teardownCall();
    this.state = 'idle';
    this.peerName = null;
    this.error = null;
    this.emit();
  }

  private armConnectTimeout() {
    this.clearTimers();
    this.stateTimer = setTimeout(() => {
      if (this.state === 'connecting') this.hangup();   // handshake never completed
    }, VoiceClient.CONNECT_TIMEOUT_MS);
  }

  private clearTimers() {
    if (this.stateTimer)   { clearTimeout(this.stateTimer);    this.stateTimer   = null; }
    if (this.ringSfxTimer) { clearInterval(this.ringSfxTimer); this.ringSfxTimer = null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(sig: Pick<VoiceSignal, 'type' | 'sdp' | 'candidate'>): boolean {
    return stompConnection.publish(`/app/${this.kind}/${this.gameId}/voice`, JSON.stringify(sig));
  }

  private emit() {
    this.onStatus?.({
      state:     this.state,
      peerName:  this.peerName,
      muted:     this.muted,
      supported: supported(),
      error:     this.error,
    });
  }
}

// One call at a time per app session.
export const voiceClient = new VoiceClient();
