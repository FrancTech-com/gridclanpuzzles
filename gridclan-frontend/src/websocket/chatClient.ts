import { stompConnection, type ConnectionStatus } from './stompClient';
import type { ChatMessage } from '@gridtypes/index';

type MessageHandler = (msg: ChatMessage) => void;
type StatusHandler  = (status: ConnectionStatus) => void;

/**
 * Community chat over the shared STOMP connection.
 *   Subscribe:      /topic/community/{communityId}
 *   Publish (send): /app/community/{communityId}/chat
 * Public API is unchanged — it now rides on `stompConnection` so chat and live
 * games share a single authenticated WebSocket.
 */
class ChatClient {
  private unsub:        (() => void) | null = null;
  private removeStatus: (() => void) | null = null;

  async connect(communityId: string, onMessage: MessageHandler, onStatus: StatusHandler) {
    // Drop any previous subscription before opening a new community's topic.
    this.disconnect();

    this.removeStatus = stompConnection.addStatusListener(onStatus);
    this.unsub = await stompConnection.subscribe(`/topic/community/${communityId}`, frame => {
      try {
        onMessage(JSON.parse(frame.body) as ChatMessage);
      } catch (e) {
        console.warn('Chat parse error', e);
      }
    });
  }

  send(communityId: string, content: string) {
    stompConnection.publish(
      `/app/community/${communityId}/chat`,
      JSON.stringify({ type: 'CHAT', content }),
    );
  }

  disconnect() {
    this.unsub?.();
    this.removeStatus?.();
    this.unsub        = null;
    this.removeStatus = null;
  }

  get isConnected() {
    return stompConnection.isConnected;
  }
}

// Singleton — one chat handle per app session.
export const chatClient = new ChatClient();
