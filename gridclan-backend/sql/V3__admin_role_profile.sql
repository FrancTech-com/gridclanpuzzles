-- ============================================================
-- GridClan DB Schema — V3 Admin role + profile fields
-- Flyway: V3__admin_role_profile.sql
-- ============================================================

-- Allow ADMIN as a valid role (users.role CHECK)
-- Note: if role is unconstrained VARCHAR(20), no migration needed.
-- This migration adds useful indexes and default admin bootstrap comment.

-- Index: active users by country (for regional analytics)
CREATE INDEX IF NOT EXISTS idx_users_country
  ON users(country_code, is_active)
  WHERE deleted_at IS NULL;

-- Index: suspended users expiry (for auto-lift job, future iteration)
CREATE INDEX IF NOT EXISTS idx_users_suspension
  ON users(suspension_expires_at)
  WHERE is_suspended = TRUE AND suspension_expires_at IS NOT NULL;

-- Index: communities by owner (for reassignment on deletion)
CREATE INDEX IF NOT EXISTS idx_communities_owner
  ON communities(owner_id)
  WHERE is_active = TRUE;

-- Index: tournaments by date range (for active query)
CREATE INDEX IF NOT EXISTS idx_tournaments_dates
  ON tournaments(starts_at, ends_at, status);

-- Tournament participants: index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_tp_score
  ON tournament_participants(tournament_id, final_score DESC NULLS LAST);

-- ── Seed ADMIN account (ops team) ────────────────────────────────────────
-- Replace password_hash with: `python3 -c "import bcrypt; print(bcrypt.hashpw(b'CHANGE_ME', bcrypt.gensalt(12)).decode())"`
INSERT INTO users (id, username, email, display_name, role, country_code, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'gridclan_admin',
  'admin@gridclan.gg',
  '[GridClan Admin]',
  'ADMIN',
  'UG',
  TRUE
) ON CONFLICT (id) DO NOTHING;
