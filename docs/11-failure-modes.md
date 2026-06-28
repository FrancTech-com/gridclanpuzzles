# 11 · Failure modes & gotchas

[← Friend-invite links](10-invite-links.md) · [Index](README.md) · [Next: Observability & roadmap →](12-observability-and-roadmap.md)

These are war stories — things that have already cost us debugging time. Read
before you go spelunking.

---

## Deployment / infra

- **Railway crash-loop on `UnknownHostException ${DB_HOST}`.** The backend needs
  every `.env` var set in Railway's variables, or it can't resolve the DB host at
  startup and restarts forever. **First thing to check on a dead deploy.**
- **`api` subdomain must be Cloudflare DNS-only (grey cloud).** Proxying it
  breaks WSS and causes TLS/redirect loops. The apex web origin can be proxied.
- **SPA redirect is load-bearing.** Without `/* → /index.html` on the web host,
  any direct deep link (game routes, challenge hub, invite links) 404s instead of
  routing. It's in `netlify.toml` — don't remove it.

## Frontend

- **React-Native-Web `Alert.alert` buttons don't fire.** On web the action
  callbacks silently never run — this once broke **Log out** and **Delete
  account**. Use `src/utils/confirm.ts` (falls back to `window.confirm` on web)
  for any confirm-gated action.
- **i18n: an existing key beats your inline `defaultValue`.** `t('x', 'new text')`
  only uses `'new text'` if `x` is missing entirely. If `en.json` defines `x`,
  that value wins. **Update `en.json`** when you change copy. (This is why the
  invite feature had to edit `en.json`, not just the call sites.)
- **expo-router typed routes reject variable-prefix templates.** A destination
  like `` `/${game}/${id}` `` doesn't satisfy `Href` — cast it (`as never`). A
  literal-prefixed template (`` `/scrabble/${id}` ``) is fine.
- **Splash timing.** The native splash is held until *both* fonts are loaded and
  auth has hydrated, so the first frame is fully styled. If you add startup work,
  don't accidentally hide the splash early.

## Real-time

- **PvP "tap does nothing".** Originally PvP refreshed *only* over WebSocket; when
  the socket couldn't connect, the board froze and taps appeared dead. Fix: a 4s
  polling fallback on every live game screen + explicit tap feedback. **Keep the
  poll.** (See [Real-time gameplay](05-realtime.md).)
- **Never put secret state in a WebSocket broadcast.** Pings are contentless by
  design; clients refetch their filtered view. Breaking this leaks hidden
  info (racks/fleets).

## Backend / build / test

- **No Maven wrapper.** Use installed `mvn`, not `./mvnw`.
- **No spring-dotenv.** The backend does **not** auto-load `.env`; source it
  yourself: `set -a && . ./.env && set +a`.
- **Integration tests need a local Redis.** The `test` profile swaps
  Postgres → H2 and disables Flyway, but `RateLimitFilter` still hits Redis.
  Start Redis first or the HTTP integration tests fail.
- **Some red tests are known/pre-existing.** Don't assume a failure is yours until
  you've compared with `main`.
- **Migrations are immutable.** Editing an applied `V{N}` breaks Flyway checksums
  everywhere. Always add a new version. (See [page 8](08-database-and-migrations.md).)

## Admin / ops

- **Seeded admin has NO password** (V3 seed) and can't log in. Promote your own
  account to `ADMIN` in the DB to use `/admin.html`.

## Quick triage table

| Symptom | Likely cause | Go to |
|---------|--------------|-------|
| API down right after deploy | missing Railway env var | [07](07-deployment.md) |
| WebSocket won't connect in prod | `api` is proxied on Cloudflare | [07](07-deployment.md) |
| Deep link / invite link 404s on web | SPA redirect missing | [07](07-deployment.md) |
| Logout/delete does nothing on web | RN-Web `Alert` buttons | [04](04-frontend.md) |
| New copy not showing | key already in `en.json` | [04](04-frontend.md) |
| PvP board frozen | WS down, poll removed | [05](05-realtime.md) |
| Integration tests failing locally | Redis not running | [06](06-environment-setup.md) |
| Can't log into admin | passwordless seeded admin | [08](08-database-and-migrations.md) |

---

[← Friend-invite links](10-invite-links.md) · [Index](README.md) · [Next: Observability & roadmap →](12-observability-and-roadmap.md)

_Last reviewed: 2026-06-28._
