-- Tournament formats grow beyond head-to-head pairs:
--   * Scrabble runs GROUP matches (4-player boards; top 2 advance) with a
--     CONSOLATION draw for first-round eliminees, then FINAL + THIRD_PLACE.
--   * Monopoly runs tables of up to 8 (winner advances).
-- Existing rows stay valid: bracket MAIN, kind H2H.

ALTER TABLE tournament_matches ADD COLUMN player3_id UUID;
ALTER TABLE tournament_matches ADD COLUMN player4_id UUID;
ALTER TABLE tournament_matches ADD COLUMN extra_players TEXT;
ALTER TABLE tournament_matches ADD COLUMN bracket VARCHAR(16) NOT NULL DEFAULT 'MAIN';
ALTER TABLE tournament_matches ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'H2H';
ALTER TABLE tournament_matches ADD COLUMN runner_up_id UUID;
