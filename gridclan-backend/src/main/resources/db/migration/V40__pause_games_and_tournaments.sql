-- Pause/resume support. A non-null paused_at freezes the per-turn clock (and
-- blocks moves) for a game, or the scheduler's advance/force-complete for a
-- tournament. Resuming clears it (and, for a game, gives the current player a
-- fresh turn window).

ALTER TABLE scrabble_games   ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE gomoku_games     ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE battleship_games ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE chess_games      ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE monopoly_games   ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE tournaments      ADD COLUMN paused_at TIMESTAMPTZ;
