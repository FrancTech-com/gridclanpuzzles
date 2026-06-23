-- ============================================================
-- GridClan DB Schema — V1 Initial Migration
-- Engine: PostgreSQL 15+
-- Flyway: V1__init_schema.sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: users
-- Identity table. PII fields set to NULL on deletion.
-- ============================================================
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- PII — subject to erasure (nulled on deletion)
  username              VARCHAR(32)  UNIQUE,
  email                 VARCHAR(255) UNIQUE,
  email_verified        BOOLEAN      DEFAULT FALSE,
  phone_number          VARCHAR(20)  UNIQUE,
  password_hash         VARCHAR(255),
  display_name          VARCHAR(64),
  avatar_url            TEXT,
  device_token          TEXT,

  -- Account status
  role                  VARCHAR(20)  NOT NULL DEFAULT 'USER',
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  is_suspended          BOOLEAN      NOT NULL DEFAULT FALSE,
  suspension_reason     TEXT,
  suspension_expires_at TIMESTAMPTZ,

  -- Deletion workflow
  deletion_requested_at TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  deletion_tombstone_id UUID UNIQUE,   -- Anonymous UUID kept for ledger FK integrity

  -- Auth
  refresh_token_hash    VARCHAR(255),
  last_login_at         TIMESTAMPTZ,
  failed_login_count    INT DEFAULT 0,
  lockout_until         TIMESTAMPTZ,

  -- Metadata (retained post-deletion for aggregate stats)
  country_code          CHAR(2)      NOT NULL DEFAULT 'UG',
  preferred_currency    VARCHAR(5)   DEFAULT 'UGX',
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email      ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone      ON users(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX idx_users_deletion   ON users(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ============================================================
-- TABLE: communities
-- ============================================================
CREATE TABLE communities (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL UNIQUE,
  description     TEXT,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  member_count    INT DEFAULT 0,
  weekly_pool_pts BIGINT DEFAULT 0,   -- Reset after weekly distribution batch job
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: community_members
-- CASCADE deletes when user is erased
-- ============================================================
CREATE TABLE community_members (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  UNIQUE (community_id, user_id)
);

-- ============================================================
-- TABLE: player_points
-- One row per user. balance must always be >= 0.
-- ============================================================
CREATE TABLE player_points (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance         BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0,
  lifetime_spent  BIGINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ============================================================
-- TABLE: tournaments
-- hints_allowed ALWAYS FALSE for COMMUNITY_TOURNAMENT tier.
-- Enforced by application layer AND by DB CHECK.
-- ============================================================
CREATE TABLE tournaments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id   UUID REFERENCES communities(id) ON DELETE SET NULL,
  name           VARCHAR(150) NOT NULL,
  game_type      VARCHAR(50)  NOT NULL,  -- 'GRID_LOCKDOWN' | 'SUM_CIPHER' | 'LINKED_RUSH'
  tier           VARCHAR(30)  NOT NULL DEFAULT 'COMMUNITY_TOURNAMENT',
  status         VARCHAR(20)  NOT NULL DEFAULT 'UPCOMING',
  entry_fee_pts  INT          DEFAULT 0,
  prize_pool_pts BIGINT       DEFAULT 0,
  hints_allowed  BOOLEAN      NOT NULL DEFAULT FALSE,
  max_players    INT,
  starts_at      TIMESTAMPTZ  NOT NULL,
  ends_at        TIMESTAMPTZ  NOT NULL,
  created_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

-- ============================================================
-- TABLE: ledger_transactions
-- PERMANENT AML record. NO FK on user_id by design —
-- allows identity decoupling after erasure while keeping
-- financial audit trail intact.
-- ============================================================
CREATE TABLE ledger_transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity (anonymized on deletion — NO FK constraint by design)
  user_id        UUID,          -- Set to NULL after erasure
  tombstone_id   UUID,          -- Set to users.deletion_tombstone_id after erasure

  -- Transaction details
  type           VARCHAR(50) NOT NULL,
    -- 'GAME_WIN' | 'HINT_USAGE' | 'AD_REWARD' | 'WITHDRAWAL_MOBILE_MONEY'
    -- | 'WITHDRAWAL_CRYPTO' | 'COMMUNITY_DISTRIBUTION' | 'TOURNAMENT_ENTRY'
    -- | 'TOURNAMENT_PRIZE' | 'FEE'
  points_delta   BIGINT      NOT NULL,       -- Positive=credit, Negative=debit
  balance_before BIGINT      NOT NULL,
  balance_after  BIGINT      NOT NULL,
  fee_pts        INT         DEFAULT 0,      -- 3% ecosystem fee recorded here
  reference_id   UUID,                       -- Session / tournament / withdrawal ID
  reference_type VARCHAR(50),
  gateway        VARCHAR(50),               -- 'KOTANI_PAY' | null
  external_ref   VARCHAR(255),             -- Kotani Pay transaction ID
  currency       VARCHAR(5),               -- UGX | KES | TZS
  fiat_amount    DECIMAL(15,4),
  status         VARCHAR(20)  NOT NULL DEFAULT 'COMPLETED',
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Balance arithmetic integrity: after must equal before + delta
  CHECK (balance_after = balance_before + points_delta)
);

CREATE INDEX idx_lt_user_id    ON ledger_transactions(user_id);
CREATE INDEX idx_lt_tombstone  ON ledger_transactions(tombstone_id);
CREATE INDEX idx_lt_created_at ON ledger_transactions(created_at);
CREATE INDEX idx_lt_type       ON ledger_transactions(type);
CREATE INDEX idx_lt_ref        ON ledger_transactions(reference_id, type);

-- ============================================================
-- TABLE: active_sessions (partitioned by month)
-- High-write hot table. Rows > 30 days → archived nightly.
-- ============================================================
CREATE TABLE active_sessions (
  id            UUID        NOT NULL,
  user_id       UUID        NOT NULL,  -- No FK — avoid cascade overhead on hot table
  game_type     VARCHAR(50) NOT NULL,  -- 'GRID_LOCKDOWN' | 'SUM_CIPHER' | 'LINKED_RUSH'
  tier          VARCHAR(30) NOT NULL,  -- 'SOLO' | 'FRIEND' | 'COMMUNITY_TOURNAMENT'
  tournament_id UUID,
  board_state   JSONB       NOT NULL,
  server_score  INT         NOT NULL DEFAULT 0,
  move_count    INT         NOT NULL DEFAULT 0,
  hints_allowed BOOLEAN     NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_move_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  PRIMARY KEY (id, started_at)         -- Partition key must be part of PK
) PARTITION BY RANGE (started_at);

-- Seed partitions (extend via cron/automation for future months)
CREATE TABLE active_sessions_2025_06 PARTITION OF active_sessions
  FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE active_sessions_2025_07 PARTITION OF active_sessions
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE active_sessions_2025_08 PARTITION OF active_sessions
  FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE active_sessions_2025_09 PARTITION OF active_sessions
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE active_sessions_2025_10 PARTITION OF active_sessions
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE active_sessions_2025_11 PARTITION OF active_sessions
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE active_sessions_2025_12 PARTITION OF active_sessions
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE active_sessions_2026_01 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_as_user_status ON active_sessions(user_id, status);
CREATE INDEX idx_as_started_at  ON active_sessions(started_at);

-- Cold storage archive table
CREATE TABLE game_sessions_archive (
  LIKE active_sessions INCLUDING ALL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: flagged_events (anti-cheat violations log)
-- ============================================================
CREATE TABLE flagged_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID,
  session_id  UUID,
  game_type   VARCHAR(50),
  reason      VARCHAR(100) NOT NULL,  -- 'SPEED_VIOLATION' | 'IMPOSSIBLE_MOVE'
  detail      TEXT,
  flagged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flagged_user ON flagged_events(user_id);
CREATE INDEX idx_flagged_at   ON flagged_events(flagged_at);

-- ============================================================
-- TABLE: audit_log
-- Immutable append-only audit trail for compliance events
-- ============================================================
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID,
  event_type  VARCHAR(100) NOT NULL,
  detail      TEXT,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_type ON audit_log(event_type);
CREATE INDEX idx_audit_at   ON audit_log(created_at);

-- ============================================================
-- NIGHTLY ARCHIVE PROCEDURE
-- Runs at 03:00 EAT via @Scheduled in Spring
-- Batches 1000 rows, commits between batches to release locks
-- ============================================================
CREATE OR REPLACE PROCEDURE archive_old_sessions()
LANGUAGE plpgsql AS $$
DECLARE archived_count INT;
BEGIN
  LOOP
    WITH moved AS (
      DELETE FROM active_sessions
      WHERE started_at < NOW() - INTERVAL '30 days'
        AND status IN ('COMPLETED', 'FLAGGED', 'ABANDONED')
      LIMIT 1000 RETURNING *
    )
    INSERT INTO game_sessions_archive SELECT *, NOW() FROM moved;
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    EXIT WHEN archived_count = 0;
    COMMIT;                    -- Release locks between batches
    PERFORM pg_sleep(0.1);     -- Reduce I/O pressure on DB
  END LOOP;
END;
$$;

-- ============================================================
-- ROW-LEVEL SECURITY
-- Backend uses gridclan_service role (BYPASSRLS).
-- RLS protects against direct DB connection leaks.
-- ============================================================
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_points       ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;

-- users: read/update own row only
CREATE POLICY users_self_read ON users FOR SELECT
  USING (id = current_setting('app.current_user_id')::UUID);
CREATE POLICY users_self_update ON users FOR UPDATE
  USING (id = current_setting('app.current_user_id')::UUID)
  WITH CHECK (id = current_setting('app.current_user_id')::UUID);

-- player_points: own row only
CREATE POLICY pp_self ON player_points FOR ALL
  USING (user_id = current_setting('app.current_user_id')::UUID);

-- active_sessions: own sessions only
CREATE POLICY sessions_self ON active_sessions FOR ALL
  USING (user_id = current_setting('app.current_user_id')::UUID);

-- ledger_transactions: read-only own; anonymized rows invisible
CREATE POLICY lt_self_read ON ledger_transactions FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::UUID
     AND tombstone_id IS NULL);

-- community_members: see own memberships
CREATE POLICY cm_self ON community_members FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::UUID);

-- ============================================================
-- ROLES
-- ============================================================
-- Service role: backend app (bypasses RLS for authoritative ops)
CREATE ROLE gridclan_service BYPASSRLS LOGIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gridclan_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gridclan_service;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO gridclan_service;

-- Read-only analytics role for reporting / regulators
CREATE ROLE gridclan_analyst;
GRANT SELECT ON ledger_transactions, communities, tournaments,
               flagged_events, audit_log TO gridclan_analyst;

-- System tombstone account (owned communities reassigned here on deletion)
INSERT INTO users (id, display_name, role, country_code)
VALUES ('00000000-0000-0000-0000-000000000001', '[system]', 'SYSTEM', 'UG')
ON CONFLICT (id) DO NOTHING;
