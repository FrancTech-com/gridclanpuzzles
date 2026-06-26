-- Persisted community chat history.
--
-- Chat was previously fire-and-forget STOMP broadcasts (ephemeral). We now save
-- every message so a community keeps its full history from the start and members
-- can scroll back / catch up. Loaded via GET /community/{id}/messages.

CREATE TABLE chat_messages (
    id           UUID PRIMARY KEY,
    community_id UUID         NOT NULL,
    sender_id    UUID         NOT NULL,
    sender_name  VARCHAR(120) NOT NULL,
    content      TEXT         NOT NULL,
    sent_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_community ON chat_messages (community_id, sent_at);
