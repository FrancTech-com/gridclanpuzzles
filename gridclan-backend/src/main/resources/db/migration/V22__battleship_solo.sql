-- Solo vs-computer support for Battleship. Mirrors V21 (gomoku): the computer is
-- player2 (all-zero sentinel id), the game starts ACTIVE with both fleets placed,
-- and hints_remaining is granted by rank (5 / 3 / 0) and decremented as used.

ALTER TABLE battleship_games ADD COLUMN vs_computer     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE battleship_games ADD COLUMN hints_remaining INT     NOT NULL DEFAULT 0;
