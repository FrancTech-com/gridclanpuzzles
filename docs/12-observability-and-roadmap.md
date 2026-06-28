# 12 · Observability & roadmap

[← Failure modes](11-failure-modes.md) · [Index](README.md)

---

## Observability

| Concern | Mechanism |
|---------|-----------|
| Crash/error reporting (frontend) | **Sentry** via `@sentry/react-native` — no-op until `SENTRY_DSN` is set in app config `extra`; never sends PII |
| In-house error reporting | `src/services/errorReporter.ts` installs global unhandled-error/rejection handlers and feeds the backend `/ops/error-report` (complements, doesn't replace, Sentry) |
| User activity / presence | `src/services/activityTracker.ts` + `presenceApi.heartbeat`; server-side `UserActivityService` |
| Audit trail | `AuditLogService` (server) |
| Admin metrics | `/admin.html` (ADMIN-only) — user metrics, searchable user list, suspend/lift |
| SEO (web) | server-correct meta + `robots.txt` / `sitemap.xml` |

### Where to look when something's wrong in prod

1. **Railway logs** for the API (startup crashes, exceptions).
2. **Netlify deploy logs** for the web build.
3. **Sentry** (if DSN configured) + the backend `/ops/error-report` sink for
   client errors.
4. **Admin dashboard** for user-level state (suspensions, activity).

## Roadmap / planned work

### Friend-invite links → true universal / app links
Today invite links open the **web app**. To open the **native app** from an
`https://` link we'd add:
- Apple **`apple-app-site-association`** (associated domains) for iOS, and
- Android **`assetlinks.json`** (App Links / intent filters),
- plus domain-ownership verification.

The `gridclan://` custom scheme already works for the app's own deep links;
universal links are the polish step. Because invite URLs are already
**route-shaped** (`/j/<game>/<code>`), they won't need to change when this lands.

### Other ideas
- **Invite QR codes** — encode the same invite URL for in-person play.
- **Branded short links** — a short domain for prettier/shareable invites.
- **"Rematch this friend"** straight from a finished game (gems-spendable replay
  already exists in `gameApi.replay`).
- **Push notifications** for "it's your turn" / "your friend joined" (push was
  removed once; the ping→refetch + poll model currently covers liveness).
- **Finish the theming migration** for `ErrorBoundary` (the last screen not yet on
  the `useColors`/`makeStyles` pattern).

## Contributing notes

- Keep these docs in sync with behaviour changes — update the relevant page in the
  same change and bump its "Last reviewed" date.
- Never commit straight to `main`; branch + PR (see [Deployment](07-deployment.md)
  checklist).
- Run `npx tsc --noEmit` + `npm test` (frontend) and `mvn test` with Redis up
  (backend) before pushing.

---

[← Failure modes](11-failure-modes.md) · [Index](README.md)

_Last reviewed: 2026-06-28._
