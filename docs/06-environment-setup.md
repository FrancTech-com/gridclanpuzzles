# 06 · Environment setup

[← Real-time gameplay](05-realtime.md) · [Index](README.md) · [Next: Deployment →](07-deployment.md)

---

## Prerequisites

| Tool | Version | For |
|------|---------|-----|
| JDK | **21** | backend |
| Maven | recent (no wrapper in repo) | backend build/test |
| PostgreSQL | 15 | backend local DB |
| Redis | 7 | rate limiting + integration tests |
| Node.js | **20** | frontend |
| Expo tooling | SDK 51 | frontend |
| Docker | optional | quick Redis/Postgres, full stack |

## Backend (`gridclan-backend/`)

```bash
cd gridclan-backend

# 1. Secrets
cp .env.example .env          # fill DB / Redis / JWT values

# 2. IMPORTANT: there is NO spring-dotenv. Source .env into your shell yourself:
set -a && . ./.env && set +a

# 3. Build & run
mvn clean package -DskipTests
mvn spring-boot:run           # needs Postgres + Redis reachable

# Or the whole stack via Docker (app + Postgres + Redis + NGINX):
docker-compose up -d
docker-compose logs -f app
```

### Running the tests

```bash
# The `test` profile swaps Postgres → H2 and disables Flyway, BUT the HTTP
# integration tests still hit Redis through RateLimitFilter. Start Redis first:
docker run -d --rm -p 6379:6379 --name gridclan-redis redis:7-alpine

mvn test
mvn test -Dtest=IntegrationTest    # single class
```

> Some red tests are known/pre-existing — don't assume a fresh failure is yours
> until you've checked against `main`.

## Frontend (`gridclan-frontend/`)

```bash
cd gridclan-frontend
npm install

npm start            # Expo dev server (scan QR with Expo Go)
npm run android      # Android emulator
npm run ios          # iOS simulator
npm test             # Jest
npx tsc --noEmit     # typecheck (strict mode is ON — run before pushing)
```

### Pointing the app at a local backend

Config is read at runtime from `Constants.expoConfig.extra.*`, layered as
`app.json` (static) → `app.config.js` (env-overridable). Override per run:

```bash
# Web against a local backend:
API_BASE_URL=http://localhost:8080 \
WS_URL=ws://localhost:8080/ws \
WEB_BASE_URL=http://localhost:8081 \
  npx expo start --web

# Android emulator reaching the host machine's backend:
#   use http://10.0.2.2:8080  (the emulator's alias for the host)
```

## Environment variables

### Frontend (`extra` in app config; override via build/CLI env)

| Key | Default (prod) | Meaning |
|-----|----------------|---------|
| `API_BASE_URL` | `https://api.gridclanpuzzle.win` | REST base URL |
| `WS_URL` | `wss://api.gridclanpuzzle.win/ws` | STOMP/WebSocket URL |
| `WEB_BASE_URL` | `https://gridclanpuzzle.win` | **Public web origin used to build invite links** ([page 10](10-invite-links.md)) |
| `SENTRY_DSN` | `''` | Sentry DSN (no-op when empty) |
| `sslPinningEnabled` | `false` | toggles cert pinning in prod builds |

### Backend (`.env`, never committed)

| Key | Meaning |
|-----|---------|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Postgres connection |
| Redis host/URL | Redis connection |
| `JWT_*` | JWT signing keys / TTLs |

> **If these are unset in a deployed environment the backend crash-loops** on
> `UnknownHostException ${DB_HOST}`. See [Deployment](07-deployment.md) and
> [Failure modes](11-failure-modes.md).

### Dev backing services

- **Supabase Postgres** + **Upstash Redis** are used for dev. Secrets live only
  in `gridclan-backend/.env`.

---

[← Real-time gameplay](05-realtime.md) · [Index](README.md) · [Next: Deployment →](07-deployment.md)

_Last reviewed: 2026-06-28._
