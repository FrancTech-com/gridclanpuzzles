-- ============================================================
-- GridClan DB Schema — V5
-- Priority-1 legal/compliance + multi-chain groundwork.
--
-- NOTE: the blueprint calls this "the V4 migration", but V4 was
-- already used for active_sessions partitions + monitoring. Flyway
-- migrations are immutable, so the pending compliance schema lands
-- here as V5 instead.
--
--   1. users columns: KYC tier, wallet addresses, preferred chain,
--      marketing consent, OFAC sanctions check, age verification.
--   2. gct_transactions  — on-chain GCT mint/burn/transfer ledger.
--   3. feature_flags      — per-country feature gating (Redis-cached).
--   4. kyc_requests       — KYC submission tracking (provider result only).
-- ============================================================

-- ── Part 1: users compliance / wallet columns ─────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kyc_tier              INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_address        VARCHAR(42),   -- EVM (Ethereum/Polygon/BSC)
  ADD COLUMN IF NOT EXISTS solana_wallet_address VARCHAR(44),   -- Solana base58
  ADD COLUMN IF NOT EXISTS preferred_chain       VARCHAR(20)  NOT NULL DEFAULT 'POLYGON',
  ADD COLUMN IF NOT EXISTS kyc_verified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_consent     BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_consent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sanctions_checked     BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sanctions_checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS country_blocked       BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS age_verified          BOOLEAN      NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_kyc_tier
  ON users(kyc_tier) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_preferred_chain
  ON users(preferred_chain);
CREATE INDEX IF NOT EXISTS idx_users_unchecked_sanctions
  ON users(sanctions_checked) WHERE sanctions_checked = FALSE;

-- ── Part 2: gct_transactions ──────────────────────────────────────────────
-- On-chain GCT movements. NO FK on user_id (AML decoupling, same as
-- ledger_transactions) so the record survives erasure.
CREATE TABLE IF NOT EXISTS gct_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID,                       -- nulled on erasure, no FK by design
  chain       VARCHAR(20)  NOT NULL,      -- 'ETHEREUM' | 'POLYGON' | 'BSC' | 'SOLANA'
  tx_hash     VARCHAR(100),
  type        VARCHAR(30)  NOT NULL,      -- 'MINT' | 'BURN' | 'TRANSFER'
  amount      DECIMAL(36,18) NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | FAILED
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gct_user_chain_created
  ON gct_transactions(user_id, chain, created_at);
CREATE INDEX IF NOT EXISTS idx_gct_tx_hash
  ON gct_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- ── Part 3: feature_flags ─────────────────────────────────────────────────
-- Source of truth for per-country feature gating; Redis caches each row
-- for 5 minutes (key: feature:{flag_name}:{country_code}).
-- Country code 'XX' = global / not country-specific.
CREATE TABLE IF NOT EXISTS feature_flags (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_name    VARCHAR(100) NOT NULL,
  country_code CHAR(2)      NOT NULL,
  enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (flag_name, country_code)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_lookup
  ON feature_flags(flag_name, country_code);

-- Seed default flags (blueprint § FEATURE FLAGS).
INSERT INTO feature_flags (flag_name, country_code, enabled) VALUES
  ('BLOCK_CHINA_SIGNUP',   'CN', TRUE),   -- PIPL data localisation
  ('US_FIAT_BLOCKED',      'US', TRUE),   -- FinCEN MSB not yet registered
  ('EU_RESTRICTED',        'EU', FALSE),  -- monitor MiCA
  ('ZA_RESTRICTED',        'ZA', TRUE),   -- FSCA CASP not yet registered
  ('IOS_CASHOUT_DISABLED', 'XX', TRUE),   -- App Store compliance pending (global)
  ('IRAN_BLOCKED',         'IR', TRUE),   -- OFAC
  ('NORTH_KOREA_BLOCKED',  'KP', TRUE),   -- OFAC
  ('SYRIA_BLOCKED',        'SY', TRUE),   -- OFAC
  ('CUBA_BLOCKED',         'CU', TRUE)    -- OFAC
ON CONFLICT (flag_name, country_code) DO NOTHING;

-- ── Part 4: kyc_requests ──────────────────────────────────────────────────
-- Tracks KYC submissions. Stores provider RESULT only — never raw ID docs
-- (Uganda DPA 2019 / GDPR data minimisation). Raw docs live with the
-- provider (Smile Identity / Jumio).
CREATE TABLE IF NOT EXISTS kyc_requests (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID         NOT NULL,
  tier_requested     INT          NOT NULL,
  provider           VARCHAR(50),                  -- 'SMILE_IDENTITY' | 'JUMIO'
  provider_reference VARCHAR(255),
  result             VARCHAR(20)  NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kyc_user    ON kyc_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_result  ON kyc_requests(result);

-- ── Grants ────────────────────────────────────────────────────────────────
GRANT ALL    ON gct_transactions, feature_flags, kyc_requests TO gridclan_service;
GRANT SELECT ON gct_transactions, feature_flags, kyc_requests TO gridclan_analyst;
