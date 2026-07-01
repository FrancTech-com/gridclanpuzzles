-- Real-money gem purchases via Relworx mobile money. One row per attempt.
-- 'reference' is our idempotency key (unique): a webhook credits gems at most
-- once per reference. Gems remain closed-loop (buying in only, no cashout).

CREATE TABLE gem_purchases (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL,
    pack_id            VARCHAR(40)  NOT NULL,
    gems               BIGINT       NOT NULL,
    currency           VARCHAR(3)   NOT NULL,
    amount             NUMERIC(18,2) NOT NULL,
    msisdn             VARCHAR(24)  NOT NULL,
    reference          VARCHAR(64)  NOT NULL UNIQUE,
    provider_reference VARCHAR(120),
    status             VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_gem_purchases_user ON gem_purchases (user_id, created_at DESC);
