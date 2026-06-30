-- Solo vs-computer support for Scrabble. Mirrors V21/V22: the computer is player2
-- (all-zero sentinel id) with its own rack, the game starts ACTIVE, and
-- hints_remaining is granted by rank (5 / 3 / 0) and decremented as used.

ALTER TABLE scrabble_games ADD COLUMN vs_computer     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE scrabble_games ADD COLUMN hints_remaining INT     NOT NULL DEFAULT 0;
