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
├── chess/                     ← Chess rules engine (ChessEngine, FEN + UCI)
├── monopoly/                  ← Monopoly rules engine (MonopolyBoard/Engine/State)
├── anticheat/                 ← anti-cheat helpers
└── exception/                 ← GlobalExceptionHandler etc.
```

## Controllers (the API surface)

`Auth`, `Account`, `Admin`, `UserProfile`, `PlayerPoints`, `Gem`,
`GlobalLeaderboard`, `Community`, `Chat`, `Tournament`, `GameSession`,
`Scrabble`, `Gomoku`, `Battleship`, `Chess`, `Monopoly`, `Challenge`,
`PasswordReset`, `Ops`, plus `GlobalExceptionHandler`. Controllers stay thin —
validation + delegation; the rules live in services.

## Key services

| Service | Responsibility |
|---------|----------------|
| `ScrabbleGameService` | Shared-board Scrabble for 2–4 players: turns, standard scoring (premiums, +50 bingo, end-game rack adjustment), move log, 5-min turn clock, broadcast ping |
| `ChessGameService` | Chess games (friend + tournament); validates every move via `ChessEngine`; 5-min clock = loss on time |
| `MonopolyGameService` | Monopoly tables of 2–8 (tournament only); wraps `MonopolyEngine`, JSON state, 5-min auto-played turn |
| `GomokuGameService` | Five-in-a-row rules, win detection, broadcast, 5-min turn clock |
| `BattleshipGameService` | Fleet placement, firing, hit/sink/win, broadcast, 5-min turn clock |
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
| `TournamentService` / `TournamentBracketService` | Three formats — knockout (Chess/Connect/Battleships), groups + losers bracket (Scrabble), tables (Monopoly): join → seed → match → advance → champion; exposes live matches for spectating |
| `UserService` / `UserActivityService` / `UserSuspensionService` | Accounts, presence, moderation |
| `AccountDeletionService` | Account deletion |
| `NotificationService` / `PushNotificationService` | Notifications |
| `AuditLogService` | Audit trail |
| `FeatureFlagService` | Feature flags (country-scoped) |
| `PasswordResetService` | Reset flow (bumps token version) |

## The Scrabble engine (`gridscrabble/`)

Real Scrabble rules on a 15×15 premium board, shared-board turn-based for **2–4
players**. The premium layout (triple/double word/letter) is mirrored on the
client for display only — the server is authoritative for scoring, which follows
the **standard rules**: letter/word premiums apply only to newly-covered squares,
a **+50 bingo** bonus for using all seven tiles, and an **end-of-game rack
adjustment** (everyone loses the value of their unplayed tiles; the player who
goes out gains the sum of the others'). The dictionary is the standard **SOWPODS**
word list (`words.txt`, ≈268k words, so plays like `QI`/`ZA` are valid).
`TileBag` manages the draw; blanks are supported (`'_'` in a rack, lowercase on
the board). Every move is recorded in a JSON `move_log` for the in-game history
and spectators.

## The Chess engine (`chess/`)

`ChessEngine` is a self-contained, server-authoritative rules engine. State is a
**FEN** string; moves are **UCI** coordinate strings (`e2e4`, promotions `e7e8q`).
It enforces full legality — check detection, castling (through/out of check),
en passant, promotion — and reports game-over: checkmate, stalemate, the
fifty-move rule and insufficient material. `ChessGameService` validates every
client move against `legalMoves()` before applying it.

## The Monopoly engine (`monopoly/`)

`MonopolyBoard` holds the 40-square board themed to **big world cities**
(same prices / colour groups / rent tables as the classic board — like the
official World Edition; the four railroads are major airports).
`MonopolyEngine` runs the rules for **2–8 players** (dice + doubles → jail,
GO salary, buying, rent with group-doubling / houses / hotels / railroads /
utilities, even building, mortgages, the Chance & Community Chest decks, jail,
auto-liquidation and bankruptcy). It also supports **property auctions** — a
declined or unaffordable property goes under the hammer and every non-bankrupt
player bids in turn — and **player-to-player trading** of cash, properties and
Get-Out-of-Jail cards (the recipient accepts/declines, allowed off-turn; a
property is tradable only if its whole colour group is unbuilt). Games are
round-bounded for tournaments (the richest net worth wins at the cap). State is
a JSON `MonopolyState` blob; `MonopolyGameService` persists it and exposes
seat-filtered views (auction + pending-trade state included).

## Scheduled jobs

| Job | What it does |
|-----|--------------|
| `TournamentSchedulerJob` | Advances tournaments `UPCOMING → ACTIVE → COMPLETED` |
| `TurnTimerJob` | Sweeps every ACTIVE PvP game every 30s and enforces the 5-minute turn clock (auto-pass / loss on time) |
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
