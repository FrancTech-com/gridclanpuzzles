-- In-game chat becomes persistent (short-lived) instead of fire-and-forget.
--
-- The pure-WebSocket relay lost messages whenever a player's socket was down
-- (the same flakiness that gave game moves their polling fallback), and a
-- player who refreshed or joined late saw an empty chat. Messages are now
-- stored so history loads on entry and a REST polling fallback can deliver
-- them without a working WebSocket. Game chat stays throwaway: rows are
-- purged after 7 days by a nightly job.

CREATE TABLE game_chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        VARCHAR(16)  NOT NULL,   -- scrabble | gomoku | battleship
    game_id     UUID         NOT NULL,
    sender_id   UUID         NOT NULL,
    sender_name VARCHAR(64)  NOT NULL,
    content     VARCHAR(300) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_chat_game    ON game_chat_messages (kind, game_id, created_at);
CREATE INDEX idx_game_chat_created ON game_chat_messages (created_at);
