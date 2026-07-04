-- Chess: 2-player games (friend invite or tournament match). Player 1 is
-- white. Rules state is the FEN; move_log keeps the UCI moves for replay
-- and live spectating.

CREATE TABLE chess_games (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code    VARCHAR(12) NOT NULL UNIQUE,
    player1_id     UUID        NOT NULL,
    player2_id     UUID,
    status         VARCHAR(24) NOT NULL DEFAULT 'WAITING_FOR_OPPONENT',
    current_player SMALLINT    NOT NULL DEFAULT 1,
    fen            TEXT        NOT NULL,
    move_log       TEXT        NOT NULL DEFAULT '',
    winner_id      UUID,
    end_reason     VARCHAR(24),
    last_move_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chess_games_p1 ON chess_games (player1_id, status);
CREATE INDEX idx_chess_games_p2 ON chess_games (player2_id, status);
CREATE INDEX idx_chess_games_status ON chess_games (status);
