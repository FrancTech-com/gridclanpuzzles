-- Financial-record retention on account deletion + terms-acceptance record.
--
-- Uganda AML Act 2013 / financial record-keeping: transaction records must
-- survive account deletion. The erasure pipeline already tombstones the old
-- points ledger; this extends the same pattern to every money table added
-- since (V26 gem purchases, V30 prize wallet + withdrawals, V31 ad sessions):
-- rows are RETAINED forever, user_id is decoupled (NULL) and replaced by the
-- deletion tombstone UUID so the audit trail stays intact without linking back
-- to a living identity. withdrawals.msisdn / gem_purchases.msisdn are kept —
-- the payout/payment destination is part of the required financial record.
--
-- users.terms_accepted_at: when the user ticked "I agree to the Terms of
-- Service and Privacy Policy" at registration (consent record).

ALTER TABLE wallet_transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE wallet_transactions ADD COLUMN tombstone_id UUID;

ALTER TABLE withdrawals ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE withdrawals ADD COLUMN tombstone_id UUID;

ALTER TABLE ad_sessions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE ad_sessions ADD COLUMN tombstone_id UUID;

ALTER TABLE gem_purchases ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE gem_purchases ADD COLUMN tombstone_id UUID;

-- player_wallets rows are also retained (lifetime totals are part of the
-- financial picture); the UNIQUE(user_id, currency) constraint permits
-- multiple NULL user_ids in Postgres, so anonymised rows coexist fine.
ALTER TABLE player_wallets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE player_wallets ADD COLUMN tombstone_id UUID;

-- Regulator / audit lookups by tombstone.
CREATE INDEX idx_wallet_tx_tombstone    ON wallet_transactions (tombstone_id) WHERE tombstone_id IS NOT NULL;
CREATE INDEX idx_withdrawals_tombstone  ON withdrawals (tombstone_id)         WHERE tombstone_id IS NOT NULL;
CREATE INDEX idx_gem_purchases_tombstone ON gem_purchases (tombstone_id)      WHERE tombstone_id IS NOT NULL;

ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
