-- ============================================================
-- GridClan DB Schema — V4
-- 1. Active-session partitions through 2027-12 (critical: V1 only
--    created partitions up to 2026-01; inserts after that crash).
-- 2. client_error_events table (frontend crash reports).
-- 3. last_active_at column on users (user presence monitoring).
-- ============================================================

-- ── Part 1: Missing active_sessions partitions ────────────────────────────
-- We are in June 2026; everything from 2026-02 onwards was missing.

CREATE TABLE IF NOT EXISTS active_sessions_2026_02 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_03 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_04 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_05 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_06 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_07 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_08 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_09 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_10 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_11 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS active_sessions_2026_12 PARTITION OF active_sessions
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 2027 (full year buffer)
CREATE TABLE IF NOT EXISTS active_sessions_2027_01 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_02 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_03 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_04 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_05 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_06 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_07 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_08 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_09 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_10 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_11 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE IF NOT EXISTS active_sessions_2027_12 PARTITION OF active_sessions
  FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- ── Part 2: User activity tracking ───────────────────────────────────────
-- last_active_at is updated on every heartbeat ping (every 60s from app).
-- Distinct from last_login_at (only set on auth).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_active
  ON users(last_active_at)
  WHERE last_active_at IS NOT NULL AND deleted_at IS NULL;

-- ── Part 3: Frontend crash / error event log ──────────────────────────────
CREATE TABLE IF NOT EXISTS client_error_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID,                      -- NULL for unauthenticated crashes
  error_type     VARCHAR(100) NOT NULL,     -- 'JS_CRASH' | 'RENDER_ERROR' | 'UNHANDLED_REJECTION' | 'NETWORK_ERROR'
  error_message  TEXT         NOT NULL,
  stack_trace    TEXT,
  component_name VARCHAR(200),             -- React component that crashed (render errors)
  screen_name    VARCHAR(200),             -- Expo Router pathname at time of crash
  app_version    VARCHAR(50),
  platform       VARCHAR(20),              -- 'ios' | 'android' | 'web'
  device_model   VARCHAR(100),
  os_version     VARCHAR(50),
  extra          JSONB,                    -- Any additional context key-value pairs
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cee_user_id    ON client_error_events(user_id);
CREATE INDEX IF NOT EXISTS idx_cee_created_at ON client_error_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cee_type       ON client_error_events(error_type);

GRANT ALL ON client_error_events TO gridclan_service;
GRANT SELECT ON client_error_events TO gridclan_analyst;
