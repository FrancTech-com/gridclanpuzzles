-- Per-game points totals — one row per (user, game), feeding the per-game and
-- breakdown leaderboards. The aggregate spendable score stays in player_points;
-- this only records how a player's earned points split across the four games.
--
-- game_type is a plain string key ('WORD_SEARCH','SCRABBLE','GOMOKU',
-- 'BATTLESHIP') — the three real-time games are not GameType enum values.
-- Points are a pure skill/progression metric with no real-world value.

CREATE TABLE player_game_points (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL,
    game_type  VARCHAR(32) NOT NULL,
    points     BIGINT      NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, game_type)
);

-- Per-game leaderboard: top scorers within one game.
CREATE INDEX idx_player_game_points_game_rank ON player_game_points (game_type, points DESC);
-- Breakdown lookups for a set of users (combined-total leaderboard).
CREATE INDEX idx_player_game_points_user ON player_game_points (user_id);
