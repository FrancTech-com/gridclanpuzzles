-- Gomoku (five-in-a-row): real-time, shared-board, turn-based 2-player games.
--
-- Players alternate placing stones on a 15×15 board; first to five in a row wins.
-- The board is stored as compact text: 15 lines of 15 chars, '.' = empty,
-- '1' = player1 stone, '2' = player2 stone. Server-authoritative. No stakes.

CREATE TABLE gomoku_games (
    id             UUID PRIMARY KEY,
    invite_code    VARCHAR(12) NOT NULL UNIQUE,
    player1_id     UUID        NOT NULL,
    player2_id     UUID,
    status         VARCHAR(24) NOT NULL DEFAULT 'WAITING_FOR_OPPONENT',
    current_player SMALLINT    NOT NULL DEFAULT 1,   -- 1 or 2 (whose turn)
    board          TEXT        NOT NULL,
    winner_id      UUID,
    last_move_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gomoku_player1 ON gomoku_games (player1_id);
CREATE INDEX idx_gomoku_player2 ON gomoku_games (player2_id);
