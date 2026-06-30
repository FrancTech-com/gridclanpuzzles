-- In-app feedback / comments about the app and games. Submitted by players,
-- read only on the admin dashboard. Plain text, never shown to other users.

CREATE TABLE feedback (
    id           UUID PRIMARY KEY,
    user_id      UUID        NOT NULL,
    display_name VARCHAR(60),
    content      TEXT        NOT NULL,
    handled      BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newest first for the admin inbox; partial index for the unread badge.
CREATE INDEX idx_feedback_created      ON feedback (created_at DESC);
CREATE INDEX idx_feedback_unhandled    ON feedback (created_at DESC) WHERE handled = false;
