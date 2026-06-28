# 07 · Deployment

[← Environment setup](06-environment-setup.md) · [Index](README.md) · [Next: Database & migrations →](08-database-and-migrations.md)

---

## Topology

```
Web   → Netlify    (static export of gridclan-frontend, SPA redirect)  → gridclanpuzzle.win
API   → Railway    (builds from repo-root Dockerfile)                  → api.gridclanpuzzle.win
DNS   → Cloudflare (apex may be proxied; `api` MUST be DNS-only)
DB    → Supabase Postgres          Cache/RL → Upstash Redis
```

## Web — Netlify

The frontend builds as a **static web app** (`output: "static"`) and deploys to
Netlify. `netlify.toml` at the **repo root** encodes everything:

```toml
[build]
  base = "gridclan-frontend"
  command = "npx expo export --platform web"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  API_BASE_URL = "https://api.gridclanpuzzle.win"
  WS_URL = "wss://api.gridclanpuzzle.win/ws"
  WEB_BASE_URL = "https://gridclanpuzzle.win"   # builds invite links

# expo-router is a client-side router: every deep link must serve index.html.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- **The SPA redirect is load-bearing.** Without `/* → /index.html`, any direct
  deep link 404s — including game routes (`/game/…`), challenge/hub routes, and
  the new invite links (`/j/<game>/<code>`).
- Build env vars in the Netlify dashboard override the defaults baked into
  `app.config.js`; keep them set so changes don't require a code edit.
- Click-by-click setup lives in `gridclan-frontend/DEPLOY.md`.

## API — Railway

- Builds from the **repo-root `Dockerfile`**.
- **All backend env vars must be set in Railway's variables** or the service
  crash-loops on startup (`UnknownHostException ${DB_HOST}`). This is the first
  thing to check on a dead deploy.

## DNS — Cloudflare

| Record | Target | Proxy |
|--------|--------|-------|
| `gridclanpuzzle.win` (apex) | Netlify (CNAME-flatten or A `75.2.60.5`) | may be proxied (orange) |
| `www` | Netlify | may be proxied |
| `api` | Railway | **DNS only (grey cloud)** |

- **`api` must be DNS-only.** Proxying it breaks the WebSocket (WSS) and causes
  TLS/redirect loops. When first provisioning, keep apex/www grey too so Netlify
  can issue the Let's Encrypt cert, then you may re-enable the proxy on the web
  records (never on `api`).

## CORS

The browser enforces CORS for API + WebSocket calls from the web origin. The
backend's allowed origins must include the production web origin
(`https://gridclanpuzzle.win`) and any local dev origins you use.

## Production URLs

| Surface | URL |
|---------|-----|
| Web app | https://gridclanpuzzle.win |
| REST API | https://api.gridclanpuzzle.win |
| WebSocket | wss://api.gridclanpuzzle.win/ws |
| Admin dashboard | `https://api.gridclanpuzzle.win/admin.html` (ADMIN only) |
| Legal pages | served by the backend under `/legal/…` |

## Deploy checklist

1. `npx tsc --noEmit` and `npm test` (frontend) green; backend `mvn test` green
   (Redis up).
2. New migration? It's a new immutable `V{N}` file (see [page 8](08-database-and-migrations.md)).
3. New frontend config key? Added in `app.json`, `app.config.js`, **and**
   `netlify.toml` (and Netlify dashboard).
4. Push branch → open PR (never commit straight to `main`).
5. After merge: Netlify auto-builds web; Railway auto-builds API. Verify both
   URLs load and a real-time game still syncs.

---

[← Environment setup](06-environment-setup.md) · [Index](README.md) · [Next: Database & migrations →](08-database-and-migrations.md)

_Last reviewed: 2026-06-28._
