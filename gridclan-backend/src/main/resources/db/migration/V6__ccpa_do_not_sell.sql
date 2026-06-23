-- ============================================================
-- GridClan DB Schema — V6
-- CCPA "Do Not Sell My Personal Information" preference
-- (blueprint § GLOBAL PRIVACY LAWS — CCPA).
--
-- GridClan never sells personal data; the flag records the user's
-- explicit request so it survives policy changes and is auditable.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS do_not_sell    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS do_not_sell_at TIMESTAMPTZ;
