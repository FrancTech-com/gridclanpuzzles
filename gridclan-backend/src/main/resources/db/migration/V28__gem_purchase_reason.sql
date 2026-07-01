-- Store the provider's reason on a failed gem purchase (e.g. insufficient funds),
-- so the app can tell the player why instead of a generic "payment failed".
ALTER TABLE gem_purchases ADD COLUMN failure_reason VARCHAR(255);
