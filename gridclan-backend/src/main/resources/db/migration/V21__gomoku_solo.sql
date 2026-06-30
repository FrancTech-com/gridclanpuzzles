-- Solo vs-computer support for Gomoku (Connect). A solo game has the computer
-- as player2 (a fixed all-zero sentinel id) and starts ACTIVE immediately.
-- hints_remaining is granted by the player's rank (Beginner 5 / Amateur 3 /
-- Professional 0) and decremented as hints are used.

ALTER TABLE gomoku_games ADD COLUMN vs_computer     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE gomoku_games ADD COLUMN hints_remaining INT     NOT NULL DEFAULT 0;
