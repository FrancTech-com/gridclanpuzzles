-- Real-cash prize wallet + withdrawals via Relworx send-payment.
--
-- player_wallets: one row per user per currency. Prize earnings (coming next)
-- credit it; withdrawals debit it. Balance can never go negative (CHECK).
--
-- withdrawals: one row per payout attempt. 'reference' is our idempotency key
-- (unique): the send-payment webhook can settle/refund at most once per
-- reference. Funds are HELD (debited) on initiate and refunded only if the
-- payout definitively fails — so a duplicate webhook can never double-refund
-- and a retried send can never double-pay.

CREATE TABLE player_wallets (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID          NOT NULL,
    currency           VARCHAR(3)    NOT NULL,
    balance            NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    lifetime_earned    NUMERIC(18,2) NOT NULL DEFAULT 0,
    lifetime_withdrawn NUMERIC(18,2) NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, currency)
);

CREATE INDEX idx_player_wallets_user ON player_wallets (user_id);

-- Immutable audit ledger of every wallet movement (earn / hold / refund).
CREATE TABLE wallet_transactions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID          NOT NULL,
    currency       VARCHAR(3)    NOT NULL,
    type           VARCHAR(32)   NOT NULL,
    amount_delta   NUMERIC(18,2) NOT NULL,
    balance_before NUMERIC(18,2) NOT NULL,
    balance_after  NUMERIC(18,2) NOT NULL,
    reference_id   UUID,
    note           VARCHAR(255),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_tx_user ON wallet_transactions (user_id, created_at DESC);

CREATE TABLE withdrawals (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID          NOT NULL,
    msisdn             VARCHAR(24)   NOT NULL,
    currency           VARCHAR(3)    NOT NULL,
    amount             NUMERIC(18,2) NOT NULL,
    reference          VARCHAR(64)   NOT NULL UNIQUE,
    provider_reference VARCHAR(120),
    status             VARCHAR(16)   NOT NULL DEFAULT 'PENDING',
    failure_reason     VARCHAR(255),
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_withdrawals_user ON withdrawals (user_id, created_at DESC);
