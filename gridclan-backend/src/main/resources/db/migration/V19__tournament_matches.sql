-- Single-elimination tournament brackets.
--
-- Tournaments now run as real brackets on the three 2-player games
-- (SCRABBLE | GOMOKU | BATTLESHIP). Players join while UPCOMING; at starts_at a
-- scheduler seeds round 1 and the tournament becomes ACTIVE. Each match is backed
-- by a real per-game row (scrabble_games / gomoku_games / battleship_games),
-- created pre-paired (no invite code). Winners advance; losers are eliminated;
-- when one player remains the tournament is COMPLETED with a winner.

-- ── Tournament: champion + current round ────────────────────────────────────
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS winner_id     UUID;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS current_round INTEGER NOT NULL DEFAULT 0;

-- ── Bracket matches ─────────────────────────────────────────────────────────
CREATE TABLE tournament_matches (
    id            UUID PRIMARY KEY,
    tournament_id UUID        NOT NULL,
    round         INTEGER     NOT NULL,          -- 1-based
    slot          INTEGER     NOT NULL,          -- position within the round
    player1_id    UUID,                          -- null only for an unfilled slot
    player2_id    UUID,                          -- null = bye (player1 auto-advances)
    game_type     VARCHAR(32) NOT NULL,          -- SCRABBLE | GOMOKU | BATTLESHIP
    game_id       UUID,                          -- the backing game row, once created
    winner_id     UUID,
    status        VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING|ACTIVE|COMPLETE|BYE
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tmatch_tournament_round ON tournament_matches (tournament_id, round, slot);
CREATE INDEX idx_tmatch_game             ON tournament_matches (game_id);
CREATE INDEX idx_tmatch_status           ON tournament_matches (tournament_id, status);
