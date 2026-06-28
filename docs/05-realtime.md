# 05 · Real-time gameplay

[← Frontend](04-frontend.md) · [Index](README.md) · [Next: Environment setup →](06-environment-setup.md)

---

GridClan's three PvP games (Scrabble, Gomoku, Battleships) update live. The model
is deliberately **"ping → refetch"**, not "push the new state".

## Why not just push state over the WebSocket?

Because hidden information would leak. A pushed payload could be sniffed to reveal
an opponent's Scrabble rack or Battleship fleet. Instead the server pushes a
**contentless ping**, and each client re-fetches its own **access-filtered view**
through the normal authenticated REST endpoint — the same endpoint that already
hides what a player shouldn't see.

This also keeps a single source of truth: the REST view. The socket is only a
"something changed, go look" nudge.

## The mechanism

```
Player A moves
   │  POST /scrabble/{id}/move   (authoritative validation + persist)
   ▼
Server updates state, then broadcasts a ping:
   /topic/scrabble/{id}  →  { gameId, status, currentPlayer, version }
   │                         (no rack, no board, no secrets)
   ▼
Players A & B receive the ping
   │  GET /scrabble/{id}     (each gets THEIR filtered view)
   ▼
Both screens re-render
```

- **Frontend:** `src/websocket/stompClient.ts` holds the STOMP connection;
  `src/websocket/gameSocket.ts` exposes `subscribeGame(kind, gameId, onUpdate)`
  returning an unsubscribe function. On each ping the screen calls its `load()`.
- **Backend:** each game service has a `broadcast(...)` that publishes the ping to
  `/topic/{kind}/{gameId}` (see `WebSocketConfig` for the broker setup).

## The polling fallback (load-bearing)

Every live game screen *also* polls its GET endpoint **every 4 seconds**:

```ts
useFocusEffect(useCallback(() => {
  load();
  const poll = setInterval(() => load(), 4000);
  let cleanup;
  subscribeGame(kind, id, () => load()).then(unsub => cleanup = unsub);
  return () => { clearInterval(poll); cleanup?.(); };
}, [id]));
```

**Why it exists:** originally PvP refreshed *only* via WebSocket. When the socket
couldn't connect — corporate proxies, restrictive mobile networks — the board
froze and a tap appeared to "do nothing". The 4s poll keeps the game live even
with no socket, and tap feedback was added so the UI always acknowledges input.
**Do not remove the poll.** See [Failure modes](11-failure-modes.md).

## Async games are different

**Friend Challenge** is not real-time. Both players solve the same puzzle
independently, scores are locked in on finish, and the challenge hub re-fetches
on focus to reveal the result. No socket involved.

## Implications for new features

- If you add a new live surface, follow the same pattern: authoritative endpoint
  + contentless broadcast + client refetch + a polling fallback.
- Never put secret state in a broadcast payload.

---

[← Frontend](04-frontend.md) · [Index](README.md) · [Next: Environment setup →](06-environment-setup.md)

_Last reviewed: 2026-06-28._
