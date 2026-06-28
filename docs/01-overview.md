# 01 · Overview

[← Index](README.md) · [Next: Architecture →](02-architecture.md)

---

## What GridClan Puzzles is

A **free-to-play, skill-only competitive puzzle platform** for emerging markets
and beyond. Players compete in puzzle games and climb leaderboards. There is **no
money anywhere in the system** — no purchases that affect outcomes, no cashout,
no crypto, no KYC.

The operating company is **ETHELES**. Player support is
`support.gridclanpuzzles@gmail.com`.

## Product principles (non-negotiable invariants)

1. **No money, ever.** Crypto, cashout, and KYC were fully removed (migrations
   V7/V8, with `preferred_currency` dropped in V9). Don't reintroduce anything
   that gives money a path into gameplay outcomes.
2. **Points are a pure skill metric.** They rank players. They have *no*
   real-world value and can never be converted to anything.
3. **Gems are a closed loop.** An in-game convenience/cosmetic currency with no
   real-world value and no cashout. Tournaments stay pure-skill, so that even if
   gems become purchasable later they can never become pay-to-win.
4. **The server is authoritative.** Clients render and submit; the server
   decides every outcome. This is the spine of anti-cheat.
5. **One codebase, every platform.** The Expo app ships to iOS, Android, and the
   web from a single source. Web-only code is guarded with `Platform.OS`.

## Game catalog

| Game | Mode | Real-time? | Route prefix |
|------|------|-----------|--------------|
| **Word Search** | Solo | n/a | `app/game/…` |
| **Grid Scrabble** | 2-player shared board | yes (WS ping + 4s poll) | `app/scrabble/…` |
| **Grid Connect** (Gomoku, 5-in-a-row) | 2-player | yes | `app/gomoku/…` |
| **Grid Battleships** | 2-player, hidden fleets | yes | `app/battleship/…` |
| **Friend Challenge** | 2-player async (same puzzle, compare scores) | no | `app/challenge/…` |
| **Tournaments** | Single-elimination brackets over the 3 PvP games | yes | `app/tournament/…` |

Solo games award native points to a **global per-game leaderboard**
(`player_game_points`, migration V18). Tournaments are single-elimination
brackets driven by a scheduler (`UPCOMING → ACTIVE → COMPLETED`, migration V19).

## Two ways players invite friends

- **Real-time games:** create a game → get an **invite code** *and* a **tappable
  link** (`/j/<game>/<code>`). The friend taps the link and is dropped straight
  into the game. (See [Friend-invite links](10-invite-links.md).)
- **Friend Challenge:** create → play your round → share a code/link
  (`/challenge/<code>`); the friend plays the same puzzle and scores are
  compared.

## Glossary

| Term | Meaning |
|------|---------|
| **Points** | Pure skill/leaderboard metric. No value, no conversion. |
| **Gems** | Closed-loop in-game currency. No value, no cashout. |
| **Invite code** | Short human code identifying a game/challenge to join. |
| **Invite link** | Tappable URL that auto-joins by code (new, 2026-06-28). |
| **Session** | A solo/casual game play instance (`GameSessionService`). |
| **Ping → refetch** | Real-time pattern: server pings "state changed", client re-GETs its filtered view. |
| **Token version** (`tv`) | Per-user JWT claim that lets us revoke tokens instantly. |
| **Ledger** | Append-only record of point/gem changes; balances are derived. |

---

[← Index](README.md) · [Next: Architecture →](02-architecture.md)

_Last reviewed: 2026-06-28._
