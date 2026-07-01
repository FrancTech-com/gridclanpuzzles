-- Move budget for solo puzzles: when move_count reaches move_limit without a
-- solve, the session is failed ("out of moves") and the player can revive (spend
-- gems) to raise the limit. 0 = no limit (non-ladder / legacy sessions).
ALTER TABLE active_sessions ADD COLUMN move_limit INT NOT NULL DEFAULT 0;
