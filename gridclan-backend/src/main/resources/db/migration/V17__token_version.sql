-- Access-token revocation: per-user session epoch.
--
-- Access tokens are stateless (valid until expiry), so before this there was no
-- way to kill one early — a stolen/leaked token stayed usable for the whole TTL,
-- even after logout. Each access token now carries the user's token_version as a
-- "tv" claim, checked on every request; bumping token_version (logout, password
-- reset) instantly invalidates all of that user's outstanding access tokens.

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
