-- ============================================================
-- GridClan DB Schema — V7
-- Gems: closed-loop in-game currency (no real-world value, no cashout).
--
--   1. player_gems       — one balance row per user.
--   2. gem_transactions  — append-only gem ledger (earn/gift/spend).
--
-- Legally equivalent to any standard mobile-game currency. Gems can never
-- be converted to money, crypto, or any tradable asset.
-- ============================================================

-- ── player_gems ────────────────────────────────────────────────────────────
CREATE TABLE player_gems (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance           BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned   BIGINT NOT NULL DEFAULT 0,
  lifetime_gifted   BIGINT NOT NULL DEFAULT 0,
  lifetime_received BIGINT NOT NULL DEFAULT 0,
  lifetime_spent    BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ── gem_transactions ─────────────────────────────────────────────────────────
CREATE TABLE gem_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL,
  type            VARCHAR(30) NOT NULL,
    -- GAME_REWARD | DAILY_BONUS | TOURNAMENT_PRIZE | AD_REWARD
    -- | GIFT_SENT | GIFT_RECEIVED | REVIVE | REPLAY | COSMETIC | HINT | SKIP
  gems_delta      BIGINT NOT NULL,           -- positive=credit, negative=debit
  balance_before  BIGINT NOT NULL,
  balance_after   BIGINT NOT NULL,
  counterparty_id UUID,                       -- other user for gifts
  reference_id    UUID,                       -- session / tournament / ad id
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (balance_after = balance_before + gems_delta)
);

CREATE INDEX idx_gem_tx_user ON gem_transactions(user_id, created_at);
CREATE INDEX idx_gem_tx_type ON gem_transactions(type);
CREATE INDEX idx_gem_tx_ref  ON gem_transactions(reference_id, type);

-- ── Row-Level Security: users see only their own rows ───────────────────────
-- Backend uses gridclan_service (BYPASSRLS) for authoritative mutations.
ALTER TABLE player_gems      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pg_self ON player_gems FOR ALL
  USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY gt_self_read ON gem_transactions FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::UUID);

-- ── Grants ────────────────────────────────────────────────────────────────
GRANT ALL    ON player_gems, gem_transactions TO gridclan_service;
GRANT SELECT ON gem_transactions TO gridclan_analyst;
