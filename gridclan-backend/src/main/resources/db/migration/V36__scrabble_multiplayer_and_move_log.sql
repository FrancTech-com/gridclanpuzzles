-- Grid Scrabble grows up to 4 players per board (tournament group games and
-- 3-4 player friend games), plus a per-game move log so players and spectators
-- can see every word played, and a resigned bitmask for multi-player resigns.
--
-- Existing rows are untouched: they stay 2-player (max_players default 2).

ALTER TABLE scrabble_games ADD COLUMN player3_id UUID;
ALTER TABLE scrabble_games ADD COLUMN player4_id UUID;
ALTER TABLE scrabble_games ADD COLUMN rack3 TEXT NOT NULL DEFAULT '';
ALTER TABLE scrabble_games ADD COLUMN rack4 TEXT NOT NULL DEFAULT '';
ALTER TABLE scrabble_games ADD COLUMN score3 INT NOT NULL DEFAULT 0;
ALTER TABLE scrabble_games ADD COLUMN score4 INT NOT NULL DEFAULT 0;
ALTER TABLE scrabble_games ADD COLUMN max_players SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE scrabble_games ADD COLUMN resigned_mask SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE scrabble_games ADD COLUMN move_log TEXT NOT NULL DEFAULT '';
