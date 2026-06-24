# Deploying GridClan Puzzles (Web) to Netlify

The GridClan frontend is an Expo app that also builds as a **static web app**
(Expo Web, `output: "static"`). The web build is deployed to **Netlify** and
served at **https://gridclanpuzzle.win**. The backend is unchanged and continues
running on **Railway** at `https://api.gridclanpuzzle.win`.

> Native iOS/Android builds are unaffected — the same codebase still ships as a
> mobile app. All web-only behaviour is guarded with `Platform.OS` checks.

---

## What builds

| Item            | Value                                            |
|-----------------|--------------------------------------------------|
| Build command   | `npx expo export --platform web`                 |
| Output folder   | `gridclan-frontend/dist`                         |
| Base directory  | `gridclan-frontend`                              |
| Node version    | 20                                               |
| Config file     | `netlify.toml` (repo root)                        |

`netlify.toml` at the repository root already encodes all of the above,
including the SPA redirect required by expo-router.

---

## One-time Netlify setup

1. **Connect the repo**
   - Netlify dashboard → **Add new site → Import an existing project**.
   - Authorize GitHub and pick this repository.

2. **Build settings** (most are auto-read from `netlify.toml`; confirm them)
   - **Base directory:** `gridclan-frontend`
   - **Build command:** `npx expo export --platform web`
   - **Publish directory:** `dist` (relative to the base directory)
   - If the dashboard shows a publish path relative to the repo root instead,
     set it to `gridclan-frontend/dist`.

3. **Environment variables** (Site settings → Environment variables)
   These override the production defaults baked into `app.config.js`; set them
   so the build is explicit and easy to change without a code edit:

   | Key            | Value                              |
   |----------------|------------------------------------|
   | `API_BASE_URL` | `https://api.gridclanpuzzle.win`   |
   | `WS_URL`       | `wss://api.gridclanpuzzle.win/ws`  |
   | `NODE_VERSION` | `20`                               |

4. **Deploy** — trigger the first deploy. Netlify installs deps in
   `gridclan-frontend`, runs the export, and publishes `dist`.

---

## Custom domain (gridclanpuzzle.win)

1. Netlify → **Domain management → Add a domain** → `gridclanpuzzle.win`
   (and add `www.gridclanpuzzle.win` as well).
2. Netlify shows the target host (e.g. `your-site.netlify.app` or a load-balancer
   IP `75.2.60.5`).
3. In **Cloudflare DNS** for `gridclanpuzzle.win`:
   - Apex `gridclanpuzzle.win` → **CNAME** to `your-site.netlify.app`
     (Cloudflare supports CNAME flattening at the apex), **or** an **A** record
     to Netlify's load-balancer IP `75.2.60.5`.
   - `www` → **CNAME** to `your-site.netlify.app`.
   - Set these records to **DNS only** (grey cloud) initially so Netlify can
     issue the Let's Encrypt certificate; you may re-enable the Cloudflare proxy
     afterwards. Avoid double TLS/redirect loops if proxied.
4. Wait for Netlify to provision HTTPS, then verify `https://gridclanpuzzle.win`
   loads the app.

> The API subdomain `api.gridclanpuzzle.win` stays pointed at **Railway** — do
> not change it.

---

## CORS

The browser enforces CORS for the API and WebSocket calls. The backend
`SecurityConfig` already allows the web origins
`https://gridclanpuzzle.win` and `https://www.gridclanpuzzle.win`
(see the CORS section of `gridclan-backend`). No further action needed unless
the web domain changes.

---

## Local web development

Run the web app locally, pointed at a local backend:

```bash
cd gridclan-frontend
# Local backend on :8080
API_BASE_URL=http://localhost:8080 WS_URL=ws://localhost:8080/ws npx expo start --web
```

Or against production (default URLs from `app.config.js`):

```bash
cd gridclan-frontend
npx expo start --web
```

Produce a production build locally to inspect `dist/`:

```bash
cd gridclan-frontend
npx expo export --platform web
npx serve dist        # or any static file server
```
