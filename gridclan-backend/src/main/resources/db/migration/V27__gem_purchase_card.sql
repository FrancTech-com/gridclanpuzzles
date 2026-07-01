-- Card (Visa/Mastercard) gem purchases via Relworx /visa/request-session.
-- Card payments have no mobile-money number, so msisdn becomes optional, and a
-- method column distinguishes the two rails. Crediting still flows through the
-- same webhook + status paths (idempotent on reference).

ALTER TABLE gem_purchases ALTER COLUMN msisdn DROP NOT NULL;
ALTER TABLE gem_purchases ADD COLUMN method VARCHAR(16) NOT NULL DEFAULT 'MOBILE_MONEY';
