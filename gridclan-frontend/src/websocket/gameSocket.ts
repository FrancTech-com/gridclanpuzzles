import { stompConnection } from './stompClient';

/**
 * Live game updates. When a player makes a move, the server publishes a small
 * "state changed" ping to `/topic/{kind}/{gameId}` (see ScrabbleGameService.broadcast).
 * The ping carries no secret state — on receipt the client re-fetches its own
 * rack/board-filtered view through the normal authenticated GET endpoint.
 */

export type GameKind   = 'scrabble' | 'battleship' | 'gomoku';
export type GameUpdate  = {
  gameId:        string;
  status:        string;
  currentPlayer: number;
  version:       number;
};

/** Subscribe to live updates for one game. Returns an unsubscribe function. */
export function subscribeGame(
  kind:     GameKind,
  gameId:   string,
  onUpdate: (update: GameUpdate) => void,
): Promise<() => void> {
  return stompConnection.subscribe(`/topic/${kind}/${gameId}`, frame => {
    try {
      onUpdate(JSON.parse(frame.body) as GameUpdate);
    } catch (e) {
      console.warn('Game update parse error', e);
    }
  });
}
