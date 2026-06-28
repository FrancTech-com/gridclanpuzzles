# 09 · Security

[← Database & migrations](08-database-and-migrations.md) · [Index](README.md) · [Next: Friend-invite links →](10-invite-links.md)

---

## Authentication & tokens

- **JWT access + refresh tokens.** `JwtService` issues/validates; `JwtAuthFilter`
  authenticates each request; `SecurityConfig` wires the filter chain.
- **Short access TTL (5 min), longer refresh TTL (7 days).**
- **Per-user token versioning (`tv` claim, migration V17).** Each user has a
  `token_version`. `JwtAuthFilter` checks the token's `tv` against the stored
  value. **Logout and password-reset bump the version**, which instantly
  invalidates every previously issued access token for that user — so a stolen
  access token dies immediately instead of living out its TTL.
- **Frontend token handling:** tokens are kept in `expo-secure-store`. The axios
  response interceptor auto-refreshes once on a 401 and replays the request;
  concurrent 401s share a single refresh via a queue (`src/api/client.ts`).

## Authorization

- Role-based (`USER`, `ADMIN`). The admin dashboard (`/admin.html`) and
  `AdminController` endpoints require `ADMIN`.
- `UserSuspensionService` enforces suspensions; suspended users are blocked from
  privileged actions.

## Rate limiting

- `RateLimitFilter` (Redis-backed) throttles abusive request rates. Because the
  filter depends on Redis, the **HTTP integration tests need a running Redis**
  (see [Environment setup](06-environment-setup.md)).

## Anti-cheat (the architectural stance)

- **The server is authoritative.** Every move is validated server-side for turn
  ownership and legality; clients never compute authoritative outcomes.
- **Access-filtered views** mean a client only ever receives what that player may
  see (their rack, their fleet). Combined with **contentless WebSocket pings**
  (see [Real-time gameplay](05-realtime.md)), hidden state never leaves the
  server.
- The `anticheat/` package holds additional heuristics/helpers.

## Transport & client hardening

- **TLS everywhere** (HTTPS/WSS). The `api` subdomain is DNS-only on Cloudflare
  so WSS isn't broken by a proxy (see [Deployment](07-deployment.md)).
- **Optional certificate pinning** in production native builds
  (`sslPinningEnabled`, `pinnedAdapter`).
- **Deep-link validation** (`src/services/deviceSecurity.ts`): incoming links are
  checked against an allowlist of path prefixes and schemes
  (`gridclan`, `https`, `exp`, `exps`). This is defence-in-depth/breadcrumbing —
  expo-router only navigates to file-defined routes anyway. The allowlist
  includes `j`, `challenge`, and the game prefixes so invite links are
  recognized rather than warned about.
- **Rooted/jailbroken device** soft warning (`warnIfDeviceRooted`) — never blocks.

## Privacy & compliance posture

- **No KYC, no financial data** — removed in V8 (`preferred_currency` dropped in
  V9). There is nothing to cash out and no money rails to protect.
- **COPPA age gate** at registration (client pre-check + authoritative
  server-side re-validation); date of birth is validated, not persisted as
  sensitive PII beyond what's needed.
- **IP retention** is bounded by `IpPurgeJob`.
- Privacy "do-not-sell/marketing/export" features were intentionally **removed**
  (they don't apply to a no-money, no-data-sale product).

## Secrets

- Backend secrets live only in `gridclan-backend/.env` (never committed) and in
  the deploy platform's variables (Railway). The frontend ships no secrets — only
  public base URLs in `extra`.

---

[← Database & migrations](08-database-and-migrations.md) · [Index](README.md) · [Next: Friend-invite links →](10-invite-links.md)

_Last reviewed: 2026-06-28._
