# 08 · Database & migrations

[← Deployment](07-deployment.md) · [Index](README.md) · [Next: Security →](09-security.md)

---

**Engine:** PostgreSQL (Supabase in dev/prod). **Schema management:** Flyway.

Migrations live in `gridclan-backend/src/main/resources/db/migration/` as
`V{N}__description.sql`. **Current head: `V19`.**

## The one rule

> **Migrations are immutable.** Once a migration has been applied anywhere, never
> edit it. To change schema, add a *new* `V{N+1}__*.sql`. Editing an applied
> migration makes Flyway's checksum mismatch and breaks every environment.

## Migration history

| Version | What it did |
|---------|-------------|
| `V1__init_schema` | initial schema |
| `V2__tournament_participants` | tournament participants |
| `V3__admin_role_profile` | admin role + profile (seeds an admin — see note) |
| `V4__partitions_and_monitoring` | partitions + monitoring |
| `V5__compliance_kyc_multichain` | **obsolete** — KYC/multichain (later removed) |
| `V6__ccpa_do_not_sell` | **obsolete** — CCPA do-not-sell (later removed) |
| `V7__gems` | gems currency |
| `V8__remove_financial_features` | removed crypto/cashout financial features |
| `V9__drop_preferred_currency` | dropped `preferred_currency` |
| `V10__fix_feature_flags_country_code_type` | feature-flag column type fix |
| `V11__challenges` | async friend challenges |
| `V12__scrabble_games` | Scrabble game tables |
| `V13__word_search` | Word Search |
| `V14__gomoku_games` | Gomoku game tables |
| `V15__battleship_games` | Battleship game tables |
| `V16__chat_messages` | persisted community chat |
| `V17__token_version` | per-user `token_version` (instant token revocation) |
| `V18__player_game_points` | per-game points → global per-game leaderboard |
| `V19__tournament_matches` | single-elimination tournament brackets |

## Notes that bite people

- **The seeded admin (V3) has no password** and cannot log in. To use the admin
  dashboard, promote your own account to the `ADMIN` role in the database. (The
  V3 seed is immutable, so this can't be "fixed" in V3 — it's by design.)
- **Test profile disables Flyway** and swaps Postgres → H2, so migrations don't
  run in unit tests. Integration behaviour that depends on real Postgres features
  must be validated against a real database.
- **Append-only domain tables.** Points/gems are ledgers — schema and code both
  assume you *insert* entries rather than mutate balances.

## Adding a migration (checklist)

1. Create `V20__short_description.sql` (next number, snake_case description).
2. Forward-only SQL; assume it runs once, in order, never re-runs.
3. Keep it backward-compatible with the currently deployed app where possible
   (deploys aren't perfectly atomic across API + DB).
4. Update the table above and bump the head reference in
   [`docs/README.md`](README.md) and the root `README.md`.

---

[← Deployment](07-deployment.md) · [Index](README.md) · [Next: Security →](09-security.md)

_Last reviewed: 2026-06-28._
