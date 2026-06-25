-- Async friend challenges.
--
-- Two players solve the SAME server-generated board; their authoritative
-- server_score (already stored on active_sessions) is compared to pick a
-- winner. This is pure entertainment — no stakes, no real-world value.
--
-- The board is captured here so the opponent gets an identical puzzle. Scores
-- are reconciled lazily from each player's completed session (see
-- ChallengeService), so there is no FK to active_sessions (sessions are
-- transient and get cleaned up) — only the session UUIDs are recorded.

CREATE TABLE challenges (
    id                  UUID PRIMARY KEY,
    code                VARCHAR(12)  NOT NULL UNIQUE,
    game_type           VARCHAR(50)  NOT NULL,
    board_state         JSONB        NOT NULL,
    creator_id          UUID         NOT NULL,
    creator_session_id  UUID         NOT NULL,
    creator_score       INT,
    opponent_id         UUID,
    opponent_session_id UUID,
    opponent_score      INT,
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ  NOT NULL
);

CREATE INDEX idx_challenges_creator  ON challenges (creator_id);
CREATE INDEX idx_challenges_opponent ON challenges (opponent_id);
