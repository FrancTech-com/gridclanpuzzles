-- ============================================================
-- GridClan Puzzles DB Schema — V9
-- Drop the vestigial preferred_currency column.
--
-- preferred_currency (UGX/KES/TZS) only ever existed to display mobile-money
-- cashout amounts in a player's local currency. The no-money pivot removed all
-- financial features (V8), so the column now stores a meaningless value and is
-- no longer read or written by the application. Migrations are immutable, so we
-- drop it here rather than editing V1. country_code is kept — it still backs
-- the registration geo-policy feature flags.
-- ============================================================

ALTER TABLE users
  DROP COLUMN IF EXISTS preferred_currency;
