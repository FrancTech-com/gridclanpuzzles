import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import type { ChatMessage } from '@gridtypes/index';

const WS_URL = Constants.expoConfig?.extra?.WS_URL ?? 'wss://api.gridclanpuzzle.win/ws';

type MessageHandler = (msg: ChatMessage) => void;
type StatusHandler  = (status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR') => void;

class ChatClient {
  private client:        Client | null = null;
  private subscription:  StompSubscription | null = null;
  private communityId:   string | null = null;
  private onMessage:     MessageHandler | null = null;
  private onStatus:      StatusHandler  | null = null;
  private reconnectDelay = 5000;

  async connect(
    communityId: string,
    onMessage:   MessageHandler,
    onStatus:    StatusHandler
  ) {
    this.communityId = communityId;
    this.onMessage   = onMessage;
    this.onStatus    = onStatus;

    const token = await SecureStore.getItemAsync('access_token');

    this.client = new Client({
      // SockJS factory — supports environments without native WS
      webSocketFactory: () => new SockJS(WS_URL.replace('wss://', 'https://').replace('ws://', 'http://')),
      connectHeaders:   { Authorization: `Bearer ${token ?? ''}` },
      reconnectDelay:   this.reconnectDelay,
      heartbeatIncoming: 25_000,
      heartbeatOutgoing: 25_000,

      onConnect: () => {
        onStatus('CONNECTED');
        this.subscribe();
      },

      onDisconnect: () => {
        onStatus('DISCONNECTED');
      },

      onStompError: frame => {
        console.error('STOMP error', frame.headers.message);
        onStatus('ERROR');
      },
    });

    this.client.activate();
  }

  private subscribe() {
    if (!this.client || !this.communityId) return;

    this.subscription = this.client.subscribe(
      `/topic/community/${this.communityId}`,
      (frame: IMessage) => {
        try {
          const msg: ChatMessage = JSON.parse(frame.body);
          this.onMessage?.(msg);
        } catch (e) {
          console.warn('Chat parse error', e);
        }
      }
    );
  }

  send(communityId: string, content: string) {
    if (!this.client?.connected) return;
    this.client.publish({
      destination: `/app/community/${communityId}/chat`,
      body: JSON.stringify({ type: 'CHAT', content }),
    });
  }

  disconnect() {
    this.subscription?.unsubscribe();
    this.client?.deactivate();
    this.client      = null;
    this.subscription = null;
  }

  get isConnected() {
    return this.client?.connected ?? false;
  }
}

// Singleton — one connection per app session
export const chatClient = new ChatClient();
