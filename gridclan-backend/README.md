# GridClan Puzzles — Backend

**Authoritative game server for GridClan Puzzles — a free-to-play mobile puzzle platform**
ETHELES · Java Spring Boot · PostgreSQL · Redis

---

## Architecture

```
[React Native Client]          — dumb terminal; renders server state only
       │ JWT Bearer on every request
       ▼
[NGINX — nginx/nginx.conf]     — TLS termination, edge rate limiting
       │
       ▼
[Spring Boot :8080]
  ├── RateLimitFilter (Order 1)   — Redis sliding window per-user + per-IP
  ├── JwtAuthFilter   (Order 2)   — JWT validation, deletion/suspension block
  ├── GameSessionService          — authoritative board, anti-cheat, scoring
  ├── AntiCheatEngine             — speed gate + move logic validators
  ├── LedgerService               — points ledger, pessimistic lock, ad idempotency
  ├── AccountDeletionService      — two-phase GDPR erasure pipeline
  └── CommunityDistributionJob    — Monday 00:00 EAT batch distribution
       │
       ▼
[PostgreSQL]  — RLS policies, partitioned active_sessions, points ledger
[Redis]       — Rate limit counters, distributed locks
```

---

## Project Structure

```
gridclan-backend/
├── pom.xml
├── nginx/
│   └── nginx.conf
├── sql/
│   ├── V1__init_schema.sql         ← All tables, RLS, roles, indexes
│   └── aml_audit_queries.sql       ← Regulator queries, ops dashboards
└── src/main/java/com/gridclan/
    ├── GridClanApplication.java
    ├── config/
    │   └── SecurityConfig.java
    ├── security/
    │   ├── JwtService.java
    │   ├── JwtAuthFilter.java       ← Blocks pending-deletion accounts
    │   └── RateLimitFilter.java     ← Redis token bucket, violation escalation
    ├── entity/
    │   ├── User.java                ← PII fields nulled on erasure
    │   ├── ActiveSession.java       ← Partitioned JSONB board state
    │   ├── LedgerTransaction.java   ← Permanent points audit record, no FK on user_id
    │   ├── Entities.java            ← PlayerPoints, Community, Tournament, Member
    │   └── enums/                   ← GameType, GameTier, SessionStatus
    ├── anticheat/
    │   ├── AntiCheatEngine.java     ← Speed + logic validation
    │   └── Validators.java          ← GridLockdown, SumCipher, LinkedRush
    ├── service/
    │   ├── GameSessionService.java  ← Authoritative move processing
    │   ├── LedgerService.java       ← Pessimistic lock, ad idempotency
    │   └── AccountDeletionService.java ← Two-phase GDPR erasure
    ├── controller/
    │   └── Controllers.java         ← Game, Account, Points endpoints
    ├── job/
    │   └── CommunityDistributionJob.java ← Weekly Monday batch
    └── exception/
        └── Exceptions.java
```

---

## Security Invariants

| Invariant | Where Enforced |
|-----------|---------------|
| Board state is server-authoritative | `GameSessionService` never trusts client state |
| `hintsAllowed` cannot be overridden by client | Set in `startSession`, hardcoded for COMMUNITY_TOURNAMENT |
| Score computed server-side only | `ScoreEngine.calculate()` called after every move |
| Anti-cheat: speed gate | `AntiCheatEngine.validateMoveSpeed()` — min ms per game type |
| Anti-cheat: logic gate | Per-game validators reject impossible moves |
| Pending-deletion accounts blocked | `JwtAuthFilter` checks `isPendingDeletion()` on every request |
| Double-spend prevention | `SELECT FOR UPDATE` (pessimistic lock) in `LedgerService` |
| Ad reward replay prevention | `ledgerRepo.existsByReferenceIdAndType()` idempotency check |
| Rate limit escalation | 5 violations / 24h → 1-hour quarantine |
| PII erased within 30 days | `AccountDeletionService.processScheduledErasures()` |
| Points ledger trail permanent | No FK on `ledger_transactions.user_id`; identity decoupled via tombstone |
| RLS on all sensitive tables | PostgreSQL RLS policies; service role BYPASSRLS |

---

## Key Endpoints

| Method | Path | Rate Limit | Auth |
|--------|------|-----------|------|
| POST | `/auth/login` | 5 / 300s | Public |
| POST | `/auth/refresh` | — | Public |
| POST | `/game/session/start` | 3 / 60s | USER |
| POST | `/game/session/move` | 30 / 10s | USER |
| POST | `/game/session/hint` | — | USER |
| POST | `/user/ad-reward` | — | USER |
| POST | `/user/delete-account` | — | USER |
| DELETE | `/user/cancel-deletion?tombstoneId=` | — | Public |

---

## Environment Variables

```
DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
JWT_SECRET                        (≥ 32 chars for HS256)
```

---

## Compliance

- **GDPR / Uganda DPA 2019**: PII erased within 30 days via `AccountDeletionService`
- **Points ledger**: `ledger_transactions` rows permanent for game integrity; identity decoupled via tombstone UUID
- **Google Play**: Self-service "Delete Account" at Profile → Settings (no email-only flow)
- **No financial features**: free-to-play only; no purchases, no cashouts, no currency handling
