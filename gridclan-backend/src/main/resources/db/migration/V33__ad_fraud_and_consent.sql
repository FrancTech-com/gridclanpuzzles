-- Ad-network compliance + anti-fraud fields.
--
-- users.is_adult: 18+ at registration (computed from the DOB age check, the
--   date itself is still never stored). NULL = unknown (accounts created
--   before this column) — treated as a minor for advertising, so they get
--   non-personalised ads, per the privacy policy.
-- users.ads_personalized: explicit opt-in consent for personalised ads
--   (GDPR-style). Default false — non-personalised unless the player consents,
--   and even then only honoured for adults.
-- ad_sessions.device_id: client install id, so the daily reward cap also
--   applies per DEVICE across accounts (multi-account farming on one phone).

ALTER TABLE users ADD COLUMN is_adult BOOLEAN;
ALTER TABLE users ADD COLUMN ads_personalized BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ad_sessions ADD COLUMN device_id VARCHAR(64);

CREATE INDEX idx_ad_sessions_device ON ad_sessions (device_id, status, completed_at);
