-- Difficulty ladders for solo play. A session may be tagged with a difficulty
-- (EASY/MEDIUM/HARD) and a level (1..20); the board, score multiplier and the
-- locked-ladder unlocking are all driven server-side from these.
--
-- ADD COLUMN with a DEFAULT on the partitioned parent cascades to every
-- partition. difficulty is NULL for non-ladder sessions (friend/tournament/
-- quick solo); level is 0 there.

ALTER TABLE active_sessions ADD COLUMN difficulty VARCHAR(10);
ALTER TABLE active_sessions ADD COLUMN level      INT NOT NULL DEFAULT 0;

-- One row per (player, game, difficulty): how far they've unlocked on that
-- ladder, plus their best score per level (JSONB: {"1": 1450, "2": 1600, ...}).
CREATE TABLE player_level_progress (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    game_type        VARCHAR(32) NOT NULL,
    difficulty       VARCHAR(10) NOT NULL,
    highest_unlocked INT         NOT NULL DEFAULT 1,
    best_scores      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_level_progress UNIQUE (user_id, game_type, difficulty)
);

CREATE INDEX idx_level_progress_user ON player_level_progress (user_id, game_type);
