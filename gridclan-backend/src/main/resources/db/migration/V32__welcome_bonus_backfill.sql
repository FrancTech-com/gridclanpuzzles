-- Backfill the joining welcome bonus (UGX 500) for users who registered before
-- the prize wallet existed. Registration has credited it since V30 shipped, so
-- eligibility = "no WELCOME_BONUS ledger entry yet" — which also makes this
-- migration safe to re-run and safe for users created moments before it runs.
--
-- The amount is fixed at the gridclan.wallet.welcome-bonus value in force
-- today (500 UGX); later config changes apply to new registrations only.

WITH eligible AS (
    SELECT u.id AS user_id
    FROM users u
    WHERE NOT EXISTS (
        SELECT 1 FROM wallet_transactions t
        WHERE t.user_id = u.id AND t.type = 'WELCOME_BONUS'
    )
),
credited AS (
    INSERT INTO player_wallets (user_id, currency, balance, lifetime_earned)
    SELECT user_id, 'UGX', 500, 500 FROM eligible
    ON CONFLICT (user_id, currency) DO UPDATE
        SET balance         = player_wallets.balance + 500,
            lifetime_earned = player_wallets.lifetime_earned + 500,
            updated_at      = now()
    RETURNING user_id, balance
)
INSERT INTO wallet_transactions
    (user_id, currency, type, amount_delta, balance_before, balance_after, note)
SELECT user_id, 'UGX', 'WELCOME_BONUS', 500, balance - 500, balance,
       'Welcome credit (backfill for accounts created before wallets launched)'
FROM credited;
