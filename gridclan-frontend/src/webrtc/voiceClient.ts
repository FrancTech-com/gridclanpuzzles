import { stompConnection } from '@websocket/stompClient';

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
 * STUN only for now (no TURN), so calls connect on most desktop/Wi-Fi networks;
 * strict mobile NATs will need the TURN step from the design doc.
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

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

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
  private gen       = 0;   // bumped on every start/stop to cancel stale async work

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
    this.teardownCall();
    this.unsub?.();
    this.unsub = null;
    this.onStatus = null;
    this.state = 'idle';
    this.peerName = null;
  }

  // ── User actions ────────────────────────────────────────────────────────────

  /** Ring my friend. */
  requestVoice() {
    if (!supported() || this.state !== 'idle') return;
    this.state = 'requesting';
    this.send({ type: 'REQUEST' });
    this.emit();
  }

  /** Accept an incoming ring → I'm the callee, wait for the offer. */
  async accept() {
    if (this.state !== 'incoming') return;
    const ok = await this.ensureMicAndPc();
    if (!ok) { this.hangup(); return; }
    this.state = 'connecting';
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
          this.emit();
        }
        break;

      case 'ACCEPT':
        // My friend accepted my ring → I'm the caller, send the offer.
        if (this.state === 'requesting') {
          const ok = await this.ensureMicAndPc();
          if (!ok) { this.hangup(); break; }
          this.peerName = sig.fromName ?? this.peerName;
          this.state = 'connecting';
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
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    pc.onicecandidate = ev => {
      if (ev.candidate) this.send({ type: 'ICE', candidate: ev.candidate.toJSON() });
    };
    pc.ontrack = ev => this.attachRemote(ev.streams[0]);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected' && this.state !== 'connected') { this.state = 'connected'; this.emit(); }
      else if (st === 'failed' || st === 'closed' || st === 'disconnected') {
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
    this.teardownCall();
    this.state = 'idle';
    this.peerName = null;
    this.emit();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(sig: Pick<VoiceSignal, 'type' | 'sdp' | 'candidate'>) {
    stompConnection.publish(`/app/${this.kind}/${this.gameId}/voice`, JSON.stringify(sig));
  }

  private emit() {
    this.onStatus?.({
      state:     this.state,
      peerName:  this.peerName,
      muted:     this.muted,
      supported: supported(),
    });
  }
}

// One call at a time per app session.
export const voiceClient = new VoiceClient();
