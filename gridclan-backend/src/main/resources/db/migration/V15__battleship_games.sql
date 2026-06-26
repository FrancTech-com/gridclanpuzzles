-- Battleship: real-time, turn-based 2-player games.
--
-- Each player has a 10×10 home grid with a randomly-placed fleet (5,4,3,3,2).
-- Each home grid is stored as compact text: 10 lines of 10 chars —
--   '.' = water (untouched)   'S' = ship (untouched)
--   'O' = miss (water fired)  'X' = hit (ship fired)
-- board1 = player1's waters (player2 fires at it); board2 = player2's. A player's
-- own ships are never sent to the opponent. Server-authoritative. No stakes.

CREATE TABLE battleship_games (
    id             UUID PRIMARY KEY,
    invite_code    VARCHAR(12) NOT NULL UNIQUE,
    player1_id     UUID        NOT NULL,
    player2_id     UUID,
    status         VARCHAR(24) NOT NULL DEFAULT 'WAITING_FOR_OPPONENT',
    current_player SMALLINT    NOT NULL DEFAULT 1,   -- 1 or 2 (whose turn to fire)
    board1         TEXT        NOT NULL,
    board2         TEXT,
    winner_id      UUID,
    last_move_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_battleship_player1 ON battleship_games (player1_id);
CREATE INDEX idx_battleship_player2 ON battleship_games (player2_id);
