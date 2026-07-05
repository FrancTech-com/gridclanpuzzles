-- Chess vs the computer (solo), mirroring the other board games' ladder columns.
-- player2_id = the fixed computer sentinel; difficulty/level drive AI strength +
-- points, and gate the locked ladder.

ALTER TABLE chess_games ADD COLUMN vs_computer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chess_games ADD COLUMN difficulty  VARCHAR(10);
ALTER TABLE chess_games ADD COLUMN level       INT NOT NULL DEFAULT 0;
