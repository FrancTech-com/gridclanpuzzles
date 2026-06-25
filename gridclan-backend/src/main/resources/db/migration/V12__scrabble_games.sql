-- Grid Scrabble: persisted shared-board, turn-based 2-player games.
--
-- Async (Words-With-Friends style): the two players alternate turns; nobody
-- needs to be online at once. Board/bag/racks are stored as compact text:
--   board  = 15 lines of 15 chars; '.' empty, UPPER = normal tile,
--            lower = a tile placed from a blank (scores 0, displays the letter).
--   bag    = remaining tiles as a string ('_' = blank).
--   rack1/2= each player's up-to-7 current tiles ('_' = blank).
-- Scores are server-authoritative (validated by MoveValidator). No stakes.

CREATE TABLE scrabble_games (
    id            UUID PRIMARY KEY,
    invite_code   VARCHAR(12) NOT NULL UNIQUE,
    player1_id    UUID        NOT NULL,
    player2_id    UUID,
    status        VARCHAR(24) NOT NULL DEFAULT 'WAITING_FOR_OPPONENT',
    current_player SMALLINT   NOT NULL DEFAULT 1,   -- 1 or 2 (whose turn)
    board         TEXT        NOT NULL,
    bag           TEXT        NOT NULL,
    rack1         TEXT        NOT NULL DEFAULT '',
    rack2         TEXT        NOT NULL DEFAULT '',
    score1        INT         NOT NULL DEFAULT 0,
    score2        INT         NOT NULL DEFAULT 0,
    pass_streak   SMALLINT    NOT NULL DEFAULT 0,    -- consecutive passes → game over at 4
    winner_id     UUID,
    last_move_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrabble_player1 ON scrabble_games (player1_id);
CREATE INDEX idx_scrabble_player2 ON scrabble_games (player2_id);
