-- Difficulty ladders for the three solo-vs-computer board games. difficulty is
-- the EASY/MEDIUM/HARD name (NULL for PvP games); level is the 1..20 ladder
-- position (0 for PvP). The AI strength + points multiplier are derived from
-- these. Locked-ladder progress reuses the player_level_progress table (V24),
-- keyed by game name 'GOMOKU' / 'BATTLESHIP' / 'SCRABBLE'.

ALTER TABLE gomoku_games     ADD COLUMN difficulty VARCHAR(10);
ALTER TABLE gomoku_games     ADD COLUMN level      INT NOT NULL DEFAULT 0;

ALTER TABLE battleship_games ADD COLUMN difficulty VARCHAR(10);
ALTER TABLE battleship_games ADD COLUMN level      INT NOT NULL DEFAULT 0;

ALTER TABLE scrabble_games   ADD COLUMN difficulty VARCHAR(10);
ALTER TABLE scrabble_games   ADD COLUMN level      INT NOT NULL DEFAULT 0;
