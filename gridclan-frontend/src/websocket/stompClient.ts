import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { getItem } from '@utils/secureStorage';
import Constants from 'expo-constants';

/**
 * Shared STOMP connection — one authenticated WebSocket per app session, fanned
 * out to many topics (community chat, live game updates, …). Subscribers come and
 * go; the underlying connection opens on the first subscription and closes when
 * the last one leaves.
 *
 * Server side: WebSocketConfig (JWT on CONNECT, `/topic` simple broker).
 */

const WS_URL = Constants.expoConfig?.extra?.WS_URL ?? 'wss://api.gridclanpuzzle.win/ws';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
type FrameHandler  = (frame: IMessage) => void;
type StatusHandler = (status: ConnectionStatus) => void;

interface TopicEntry {
  sub: StompSubscription | null;
  handlers: Set<FrameHandler>;
}

class StompConnection {
  private client:     Client | null = null;
  private connected   = false;
  private connecting: Promise<void> | null = null;
  private topics      = new Map<string, TopicEntry>();
  private statusListeners = new Set<StatusHandler>();

  get isConnected() {
    return this.connected;
  }

  /** Subscribe to a topic. Returns an unsubscribe function. Opens the connection if needed. */
  async subscribe(topic: string, handler: FrameHandler): Promise<() => void> {
    let entry = this.topics.get(topic);
    if (!entry) {
      entry = { sub: null, handlers: new Set() };
      this.topics.set(topic, entry);
    }
    entry.handlers.add(handler);

    await this.ensureClient();
    this.openSub(topic, entry);

    return () => this.unsubscribe(topic, handler);
  }

  publish(destination: string, body: string) {
    if (this.client?.connected) {
      this.client.publish({ destination, body });
    }
  }

  /** Listen for connection status changes. Fires immediately with the current status. */
  addStatusListener(listener: StatusHandler): () => void {
    this.statusListeners.add(listener);
    listener(this.connected ? 'CONNECTED' : 'DISCONNECTED');
    return () => this.statusListeners.delete(listener);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async ensureClient(): Promise<void> {
    if (this.client) return this.connecting ?? Promise.resolve();
    this.connecting = new Promise<void>(resolve => {
      void (async () => {
        const token = await getItem('access_token');
        this.client = new Client({
          webSocketFactory: () =>
            new SockJS(WS_URL.replace('wss://', 'https://').replace('ws://', 'http://')),
          connectHeaders:    { Authorization: `Bearer ${token ?? ''}` },
          reconnectDelay:    5000,
          heartbeatIncoming: 25_000,
          heartbeatOutgoing: 25_000,

          onConnect: () => {
            this.connected = true;
            this.emitStatus('CONNECTED');
            // (Re)open every known topic — covers first connect and reconnects.
            this.topics.forEach((entry, topic) => {
              entry.sub = null;
              this.openSub(topic, entry);
            });
            resolve();
          },
          onDisconnect:      () => { this.connected = false; this.emitStatus('DISCONNECTED'); },
          onWebSocketClose:  () => { this.connected = false; this.emitStatus('DISCONNECTED'); },
          onStompError:      frame => {
            console.error('STOMP error', frame.headers.message);
            this.emitStatus('ERROR');
          },
        });
        this.client.activate();
      })();
    });
    return this.connecting;
  }

  private openSub(topic: string, entry: TopicEntry) {
    if (!this.client || !this.connected || entry.sub) return;
    entry.sub = this.client.subscribe(topic, frame => {
      entry.handlers.forEach(h => {
        try { h(frame); } catch (e) { console.warn('STOMP handler error', e); }
      });
    });
  }

  private unsubscribe(topic: string, handler: FrameHandler) {
    const entry = this.topics.get(topic);
    if (!entry) return;
    entry.handlers.delete(handler);
    if (entry.handlers.size === 0) {
      entry.sub?.unsubscribe();
      this.topics.delete(topic);
      if (this.topics.size === 0) this.shutdown();
    }
  }

  private emitStatus(status: ConnectionStatus) {
    this.statusListeners.forEach(l => {
      try { l(status); } catch (e) { console.warn('STOMP status listener error', e); }
    });
  }

  private shutdown() {
    this.client?.deactivate();
    this.client     = null;
    this.connected  = false;
    this.connecting = null;
  }
}

// Singleton — one connection shared by chat and all live games.
export const stompConnection = new StompConnection();
