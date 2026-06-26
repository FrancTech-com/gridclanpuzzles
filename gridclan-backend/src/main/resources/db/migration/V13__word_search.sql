-- V13: Word Search replaces the three retired single-player games.
--
-- The original solo games GRID_LOCKDOWN, SUM_CIPHER and LINKED_RUSH were removed in the
-- new-catalog change; WORD_SEARCH is now the only solo GameType. The `game_type` columns
-- are plain VARCHAR(50) with no CHECK constraint (see V1), so no constraint change is
-- needed — but any rows that still carry a retired type would fail to map onto the new
-- enum when loaded, so we purge them here. (Dev/pre-launch data only.)
--
-- tournament_participants references tournaments(id) ON DELETE CASCADE (V2), so deleting a
-- tournament removes its participants automatically. active_sessions.tournament_id is not a
-- foreign key, so no ordering constraint applies.

DELETE FROM tournaments
 WHERE game_type IN ('GRID_LOCKDOWN', 'SUM_CIPHER', 'LINKED_RUSH');

DELETE FROM active_sessions
 WHERE game_type IN ('GRID_LOCKDOWN', 'SUM_CIPHER', 'LINKED_RUSH');

DELETE FROM challenges
 WHERE game_type IN ('GRID_LOCKDOWN', 'SUM_CIPHER', 'LINKED_RUSH');
