-- Ad-reward earning system: watching ads is what funds player payouts (NOT gem
-- purchases — gems stay closed-loop; buying a pack only buys ad-FREE months).
--
-- ad_sessions: one row per ad view, issued server-side BEFORE the ad plays and
-- completed (credited) at most once — the idempotency unit for ad money.
--
-- users.ad_free_until: gem-pack buyers get the post-game popup ads blocked
-- until this instant (1/4/8 months by pack). The opt-in "watch ad for rewards"
-- button keeps working — it's the earning mechanism, never forced.

ALTER TABLE users ADD COLUMN ad_free_until TIMESTAMPTZ;

CREATE TABLE ad_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID          NOT NULL,
    provider      VARCHAR(32),
    placement     VARCHAR(16)   NOT NULL DEFAULT 'REWARDED',   -- REWARDED | POST_GAME
    status        VARCHAR(16)   NOT NULL DEFAULT 'ISSUED',      -- ISSUED | COMPLETED
    reward_amount NUMERIC(18,2) NOT NULL,
    currency      VARCHAR(3)    NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_ad_sessions_user_day ON ad_sessions (user_id, created_at DESC);

-- ── Welcome credit: every player starts with UGX 500 in their wallet ─────────
-- Backfill all existing users, exactly once (guarded by the WELCOME_BONUS
-- ledger row). Order matters: top up wallets that already exist FIRST, then
-- create wallets for everyone else, then write one ledger row per credit.

-- 1. Users who somehow already have a UGX wallet (defensive): top it up.
UPDATE player_wallets w
SET balance = w.balance + 500,
    lifetime_earned = w.lifetime_earned + 500,
    updated_at = now()
WHERE w.currency = 'UGX'
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = w.user_id AND u.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions t
                  WHERE t.user_id = w.user_id AND t.type = 'WELCOME_BONUS');

-- 2. Everyone else: create their UGX wallet holding the credit.
INSERT INTO player_wallets (user_id, currency, balance, lifetime_earned)
SELECT u.id, 'UGX', 500, 500
FROM users u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM player_wallets w
                  WHERE w.user_id = u.id AND w.currency = 'UGX')
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions t
                  WHERE t.user_id = u.id AND t.type = 'WELCOME_BONUS');

-- 3. One audit ledger row per credited user (also the double-pay guard).
INSERT INTO wallet_transactions (user_id, currency, type, amount_delta,
                                 balance_before, balance_after, note)
SELECT w.user_id, 'UGX', 'WELCOME_BONUS', 500, w.balance - 500, w.balance,
       'Welcome credit'
FROM player_wallets w
WHERE w.currency = 'UGX'
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions t
                  WHERE t.user_id = w.user_id AND t.type = 'WELCOME_BONUS');
