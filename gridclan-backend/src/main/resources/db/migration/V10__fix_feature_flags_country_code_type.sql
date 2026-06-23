-- ============================================================
-- GridClan Puzzles DB Schema — V10
-- Fix feature_flags.country_code column type: CHAR(2) -> VARCHAR(2).
--
-- V5 created feature_flags.country_code as CHAR(2) (bpchar), but the JPA entity
-- (com.gridclan.entity.FeatureFlag, @Column length = 2) and every other use of
-- country_code (V1 users.country_code) map it as VARCHAR(2). Under
-- spring.jpa.hibernate.ddl-auto=validate this mismatch fails startup:
--   "wrong column type in feature_flags.country_code; found [bpchar], expecting [varchar(2)]".
-- Migrations are immutable, so we correct the type forward here rather than
-- editing V5. CHAR(2) blank-pads values, so cast/trim to keep stored codes clean.
-- ============================================================

ALTER TABLE feature_flags
  ALTER COLUMN country_code TYPE VARCHAR(2) USING TRIM(TRAILING FROM country_code);
