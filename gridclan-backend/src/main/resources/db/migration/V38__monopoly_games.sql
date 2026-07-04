-- Monopoly tables (tournament-only; up to 8 players a table). The full rules
-- state is JSON in `state`; players_csv mirrors the seat order for cheap
-- membership checks by the chat/voice relays.

CREATE TABLE monopoly_games (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status       VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    players_csv  TEXT        NOT NULL,
    state        TEXT        NOT NULL,
    winner_id    UUID,
    last_move_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_monopoly_games_status ON monopoly_games (status);
