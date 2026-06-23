# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GridClan Puzzles — a competitive, free-to-play puzzle-gaming platform for emerging markets and beyond. Players earn points through skill-based gameplay. Points are a pure skill metric with **no real-world value, no cashouts, and no financial features of any kind**. **No pay-to-play, ever.**

Monorepo with two sub-projects, each self-contained (run commands from inside the relevant folder):

- `gridclan-backend/` — Java 21 / Spring Boot 3.3 authoritative game server (PostgreSQL 15, Redis)
- `gridclan-frontend/` — React Native mobile app (Expo SDK 51, expo-router, TypeScript)

## Commands

### Backend (`gridclan-backend/`)

There is **no Maven wrapper** — use a locally installed `mvn`, not `./mvnw`.

```bash
mvn clean package -DskipTests        # build
mvn test                             # all tests
mvn test -Dtest=IntegrationTest      # single test class
mvn test -Dtest=LedgerServiceTest#methodName   # single test method
mvn spring-boot:run                  # run locally (needs Postgres + Redis from .env)
docker-compose up -d                 # full stack: app + Postgres + Redis + NGINX
```

Tests use the `test` Spring profile (`application-test.yml`): H2 instead of Postgres, Flyway disabled. **The HTTP integration tests require a local Redis** (they go through the rate-limit filter):

```bash
docker run -d --rm -p 6379:6379 --name gridclan-redis redis:7-alpine
```

Some tests were already red before your change — when a test fails, check whether it's pre-existing before assuming your change caused it.

### Frontend (`gridclan-frontend/`)

```bash
npm install
npm start            # Expo dev server
npm run android      # Android emulator
npm test             # Jest (jest-expo preset, watch mode)
npx jest path/to/file.test.tsx --watchAll=false   # single test, no watch
```

API base URL comes from `Constants.expoConfig.extra.API_BASE_URL` in `app.json` (default `https://api.gridclanpuzzle.win`); point it at `http://10.0.2.2:8080` for a local backend on the Android emulator.

## Architecture

### Trust model (the most important invariant)

The client is a dumb terminal — it renders server state only. The backend is authoritative for everything: board state, scoring (`ScoreEngine.calculate()` after every move), hints, and points balances. Never add logic that trusts client-supplied game state, scores, or balances.

### Backend request flow

```
NGINX (TLS, edge rate limiting)
  → RateLimitFilter (Order 1)  — Redis sliding window per-user + per-IP; 5 violations/24h → 1h quarantine
  → JwtAuthFilter   (Order 2)  — JWT validation; blocks pending-deletion/suspended accounts on every request
  → Controllers → Services → PostgreSQL (RLS on sensitive tables) / Redis
```

Key packages under `src/main/java/com/gridclan/`:

- `anticheat/` — `AntiCheatEngine` (speed gate: min ms per move per game type) + per-game logic validators (GridLockdown, SumCipher, LinkedRush) that reject impossible moves
- `service/LedgerService` — points movement; pessimistic lock (`SELECT FOR UPDATE`) prevents double-spend of points; ad rewards are idempotent via `existsByReferenceIdAndType`
- `service/GemService` — closed-loop in-game gems (revives/replays/cosmetics); no real-world value and no cashout path of any kind
- `service/AccountDeletionService` — two-phase GDPR erasure; PII nulled within 30 days, but `ledger_transactions` rows are **permanent** (game-integrity audit — no FK on `user_id`; identity decoupled via tombstone UUID)
- `job/CommunityDistributionJob` — weekly Monday 00:00 EAT batch points distribution

### Database migrations

Flyway, under `gridclan-backend/src/main/resources/db/migration/`. Migrations are **immutable** — add a new `V{N}__description.sql`, never edit an applied one. Current head: V9. Note V8 removed all real-money/crypto/cashout/KYC schema and V9 dropped the vestigial `preferred_currency` column — the game has no financial features.

### Frontend structure

- `app/` — expo-router file-based routes: `(auth)`, `(tabs)`, `game/`, `community/`, `tournament/`, `profile/`
- `src/api/client.ts` — axios with JWT from `expo-secure-store`, auto-refresh on 401 (queued), and certificate pinning in production builds (`pinnedAdapter.ts`)
- `src/store/` — Redux Toolkit slices (auth, game, points) with redux-persist
- `src/websocket/` — STOMP over SockJS for live game/chat
- `src/i18n/` — 6 locales (en, fr, hi, pt, sw, tl); user-facing strings go through i18next, not hardcoded
- `src/services/` — activity tracking, device security checks, Sentry error reporting

### No financial features (hard rule)

GridClan Puzzles is a pure entertainment game. There is **no money, no crypto, no token, no cashout, no KYC, and no payment integration** anywhere in the stack — all of it was removed in the no-money pivot (DB migrations V7/V8/V9). Points and gems are closed-loop game state with no real-world value. Never reintroduce withdrawal, currency, mobile-money, fiat, on-chain, or KYC logic.

## Gotchas

- The root and backend READMEs carry the canonical command reference and the full security-invariant table (`gridclan-backend/README.md`) — keep them in sync when behavior changes.
