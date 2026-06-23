-- ============================================================
-- GridClan DB Schema — V2 Tournament Participants
-- Flyway: V2__tournament_participants.sql
-- ============================================================

-- tournament_participants — many-to-many join table
-- Required by TournamentRepository.removeParticipant()
CREATE TABLE IF NOT EXISTS tournament_participants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',   -- 'ACTIVE' | 'ELIMINATED' | 'WITHDRAWN'
  final_score   INT,
  final_rank    INT,
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX idx_tp_tournament ON tournament_participants(tournament_id);
CREATE INDEX idx_tp_user       ON tournament_participants(user_id);

-- RLS: users see only their own tournament entries
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tp_self ON tournament_participants FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::UUID);

GRANT ALL ON tournament_participants TO gridclan_service;
GRANT SELECT ON tournament_participants TO gridclan_analyst;
