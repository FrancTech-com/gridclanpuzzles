-- ============================================================
-- GridClan DB Schema — V8
-- Remove ALL real-money / crypto / cashout / KYC schema.
--
-- GridClan is now a pure entertainment game: no financial features, no
-- crypto, no cashout. Migrations are immutable, so rather than editing the
-- old V1/V5 migrations this forward migration drops the now-defunct schema.
-- ============================================================

-- ── 1. Drop crypto/wallet/KYC/sanctions columns on users ────────────────────
-- (Dependent indexes are dropped automatically with their columns.)
ALTER TABLE users
  DROP COLUMN IF EXISTS wallet_address,
  DROP COLUMN IF EXISTS solana_wallet_address,
  DROP COLUMN IF EXISTS preferred_chain,
  DROP COLUMN IF EXISTS kyc_tier,
  DROP COLUMN IF EXISTS kyc_verified_at,
  DROP COLUMN IF EXISTS sanctions_checked,
  DROP COLUMN IF EXISTS sanctions_checked_at,
  DROP COLUMN IF EXISTS country_blocked;

-- ── 2. Drop crypto + KYC tables ─────────────────────────────────────────────
DROP TABLE IF EXISTS gct_transactions;
DROP TABLE IF EXISTS kyc_requests;

-- ── 3. Strip fiat / gateway columns from the points ledger ──────────────────
-- ledger_transactions is now a pure POINTS audit log (no money concepts).
ALTER TABLE ledger_transactions
  DROP COLUMN IF EXISTS fee_pts,
  DROP COLUMN IF EXISTS gateway,
  DROP COLUMN IF EXISTS external_ref,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS fiat_amount;

-- ── 4. Tournaments are always free — enforce entry_fee_pts = 0 ───────────────
UPDATE tournaments SET entry_fee_pts = 0 WHERE entry_fee_pts <> 0;
ALTER TABLE tournaments
  ALTER COLUMN entry_fee_pts SET DEFAULT 0;
ALTER TABLE tournaments
  ADD CONSTRAINT chk_tournament_free CHECK (entry_fee_pts = 0);

-- ── 5. Remove cashout / fiat feature flags (no financial activity) ──────────
DELETE FROM feature_flags
  WHERE flag_name IN ('US_FIAT_BLOCKED', 'IOS_CASHOUT_DISABLED');
