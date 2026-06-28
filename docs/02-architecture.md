# 02 · Architecture

[← Overview](01-overview.md) · [Index](README.md) · [Next: Backend →](03-backend.md)

---

## System diagram

```
        ┌──────────────────────────── Clients ────────────────────────────┐
        │  iOS / Android (Expo native)        Web (Expo static export)     │
        │  bundle id gg.gridclan.app          https://gridclanpuzzle.win   │
        └───────────────┬─────────────────────────────┬───────────────────┘
                        │ HTTPS (REST)                 │ WSS (STOMP)
                        ▼                              ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  Spring Boot API  —  https://api.gridclanpuzzle.win (Railway)  │
        │                                                               │
        │  SecurityConfig ─ JwtAuthFilter ─ RateLimitFilter ─ Controllers│
        │  Game services (authoritative)   Tournaments   Points/Gems     │
        │  WebSocketConfig (STOMP broker)  Admin         Scheduled jobs   │
        └───────┬───────────────────────────┬───────────────────┬───────┘
                ▼                            ▼                   ▼
        PostgreSQL (Supabase)         Redis (Upstash)      Read replica (optional)
        durable state + Flyway        rate-limit + cache   ReadReplicaConfig
```

## Components

### Clients
One Expo codebase, three targets. The web target is a **static export**
(`output: "static"`) served from a CDN; native targets are normal app-store
builds. All three talk to the same API and WebSocket. Web-only behaviour is
guarded with `Platform.OS === 'web'`.

### API server (authoritative)
Spring Boot 3.3 on Java 21. It is the **single source of truth** for every game
result, balance, and tournament outcome. It exposes:
- **REST** for everything request/response (auth, profile, game views, moves,
  points/gems, tournaments, admin).
- **WebSocket/STOMP** purely for lightweight "state changed" pings (see
  [Real-time gameplay](05-realtime.md)). No secret state travels over the socket.

### Data stores
- **PostgreSQL (Supabase)** — durable state; schema is Flyway-managed (V1…V19).
- **Redis (Upstash)** — rate limiting (`RateLimitFilter`) and caching
  (`BalanceCache`, leaderboard hints). Treated as disposable.
- **Optional read replica** — `ReadReplicaConfig` routes read-heavy queries.

## Request flow (a real-time move)

```
1. Player taps a cell.
2. Client POSTs the move to the authoritative endpoint (e.g. /gomoku/{id}/move),
   with the access token attached by the axios request interceptor.
3. Server validates turn + legality, updates state, persists, recomputes view.
4. Server publishes a tiny ping to /topic/gomoku/{id} (no secret state).
5. Both clients receive the ping → re-GET their own filtered view → re-render.
   (A 4s poll on each game screen does the same if the socket is down.)
```

## Data-flow principles

- **Authoritative compute on the server.** Clients never decide outcomes.
- **Append-only ledgers** for points/gems; balances are derived and cached, so a
  cache loss is recoverable by replaying the ledger.
- **Access-filtered views.** Each GET returns only what *that* player may see
  (your rack, your fleet) — which is why the WS ping can be contentless.

## Cross-cutting concerns

| Concern | Where it lives |
|---------|----------------|
| AuthN/AuthZ | `SecurityConfig`, `JwtAuthFilter`, `JwtService` (backend); `authSlice` + secure-store (frontend) |
| Rate limiting | `RateLimitFilter` (Redis) |
| Error reporting | Sentry (frontend, opt-in via DSN) + in-house `errorReporter` → `/ops/error-report` |
| Activity/presence | `activityTracker`, `presenceApi.heartbeat`, `UserActivityService` |
| Audit | `AuditLogService` |
| Scheduling | `TournamentSchedulerJob`, `CommunityDistributionJob`, `ArchiveJob`, `IpPurgeJob` |
| i18n | `react-i18next` (6 languages, `en.json` is source of truth) |
| Theming | `useColors`/`useTheme` + `makeStyles(Colors)` |

See the [Architecture decisions](#architecture-decisions) below for the *why*.

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| No money in the system | Regulatory simplicity + product pivot; protects skill-only integrity. |
| Authoritative server | Anti-cheat; clients can't be trusted with outcomes. |
| Append-only ledgers | Auditable, reconstructable balances. |
| One Expo codebase (native + web) | Ship everywhere from one source; web is the zero-install channel. |
| Ping → refetch (not WS state push) | Keeps hidden state server-side; REST view stays the one authority. |
| 4s polling fallback on live screens | Survives proxies/flaky networks that block WebSockets. |
| Per-user token versioning (`tv`) | Instant revocation of stolen access tokens on logout/reset. |
| Invite links target the web origin | Work for everyone, zero setup; native universal links are a later polish. |
| Static web export + SPA redirect | Cheap CDN hosting; client router needs `index.html` for every path. |
| `api` subdomain DNS-only on Cloudflare | Proxying it breaks WSS and causes TLS/redirect loops. |

---

[← Overview](01-overview.md) · [Index](README.md) · [Next: Backend →](03-backend.md)

_Last reviewed: 2026-06-28._
