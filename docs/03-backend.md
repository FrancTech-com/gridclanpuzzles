# 03 · Backend

[← Architecture](02-architecture.md) · [Index](README.md) · [Next: Frontend →](04-frontend.md)

---

**Stack:** Java 21 · Spring Boot 3.3 · PostgreSQL · Redis · Flyway · Maven
(no wrapper — use a locally installed `mvn`).

## Package layout

```
com.gridclan/
├── GridClanApplication.java   ← entrypoint
├── controller/                ← HTTP endpoints (thin; delegate to services)
├── service/                   ← business logic + persistence orchestration
├── repository/                ← Spring Data repositories
├── entity/                    ← JPA entities
├── dto/                       ← request/response shapes
├── security/                  ← JwtAuthFilter, JwtService, RateLimitFilter
├── config/                    ← Security/WebSocket/Redis/ReadReplica/PasswordEncoder
├── job/                       ← scheduled jobs
├── gridscrabble/              ← Scrabble rules engine (TileBag, Premiums, …)
├── anticheat/                 ← anti-cheat helpers
└── exception/                 ← GlobalExceptionHandler etc.
```

## Controllers (the API surface)

`Auth`, `Account`, `Admin`, `UserProfile`, `PlayerPoints`, `Gem`,
`GlobalLeaderboard`, `Community`, `Chat`, `Tournament`, `GameSession`,
`Scrabble`, `Gomoku`, `Battleship`, `Challenge`, `PasswordReset`, `Ops`, plus
`GlobalExceptionHandler`. Controllers stay thin — validation + delegation; the
rules live in services.

## Key services

| Service | Responsibility |
|---------|----------------|
| `ScrabbleGameService` | Shared-board Scrabble: turns, scoring, board state, broadcast ping |
| `GomokuGameService` | Five-in-a-row rules, win detection, broadcast |
| `BattleshipGameService` | Fleet placement, firing, hit/sink/win, broadcast |
| `ChallengeService` | Async same-puzzle challenges; score comparison + outcome |
| `GameSessionService` | Solo/casual sessions (Word Search etc.) |
| `ScoreEngine` | Scoring rules |
| `HintEngine` | Hint generation (gem-spendable) |
| `GameBoardGenerator` | Puzzle/board generation |
| `WordSearch` | Word Search puzzle logic |
| `PlayerPointsService` | Append-only points ledger + per-game points |
| `GemService` | Append-only gem ledger, gifting, ad-reward |
| `BalanceCache` | Derived/cached balances |
| `LeaderboardService` | Global + per-game leaderboards |
| `TournamentService` / `TournamentBracketService` | Brackets: join → pair → match → advance → champion |
| `UserService` / `UserActivityService` / `UserSuspensionService` | Accounts, presence, moderation |
| `AccountDeletionService` | Account deletion |
| `NotificationService` / `PushNotificationService` | Notifications |
| `AuditLogService` | Audit trail |
| `FeatureFlagService` | Feature flags (country-scoped) |
| `PasswordResetService` | Reset flow (bumps token version) |

## The Scrabble engine (`gridscrabble/`)

Real Scrabble rules on a 15×15 premium board, shared-board turn-based two-player.
The premium layout (triple/double word/letter) is mirrored on the client for
display only — the server is authoritative for scoring. `TileBag` manages the
draw; blanks are supported (`'_'` in a rack, lowercase on the board).

## Scheduled jobs

| Job | What it does |
|-----|--------------|
| `TournamentSchedulerJob` | Advances tournaments `UPCOMING → ACTIVE → COMPLETED` |
| `CommunityDistributionJob` | Community payouts/maintenance |
| `ArchiveJob` | Archives old data |
| `IpPurgeJob` | Purges stored IPs per retention policy |

## Conventions

- **Authoritative-server rule:** never trust a client-computed result. Validate
  turn ownership and legality on every move.
- **Ledgers are append-only.** Adjust balances by appending entries, not editing.
- **Migrations are immutable.** Add `V{N}__*.sql`; never edit an applied one.
  See [Database & migrations](08-database-and-migrations.md).
- **Broadcasts carry no secrets.** A game service's `broadcast` publishes a
  "state changed" ping; clients re-fetch their filtered view.
- **Errors:** throw domain exceptions; `GlobalExceptionHandler` shapes the HTTP
  response. The frontend surfaces `error.response.data.message` to users.

## Build & test

```bash
cd gridclan-backend
set -a && . ./.env && set +a        # no spring-dotenv: source .env yourself
mvn clean package -DskipTests       # build
mvn spring-boot:run                 # run (needs Postgres + Redis reachable)

# Tests use the `test` profile (Postgres→H2, Flyway disabled), but the HTTP
# integration tests hit Redis via RateLimitFilter — start Redis first:
docker run -d --rm -p 6379:6379 --name gridclan-redis redis:7-alpine
mvn test
mvn test -Dtest=IntegrationTest     # single class
```

> Some red tests are known/pre-existing. See [Failure modes](11-failure-modes.md).

---

[← Architecture](02-architecture.md) · [Index](README.md) · [Next: Frontend →](04-frontend.md)

_Last reviewed: 2026-06-28._
