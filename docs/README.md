# GridClan Puzzles — Engineering Documentation

This is the full engineering handbook for **GridClan Puzzles**: a free-to-play,
skill-only competitive puzzle platform (one Java/Spring backend + one Expo
codebase shipping to iOS, Android, and the web).

It is written so that someone — including future-you — can pick up the project
cold and understand *what* it is, *how* it's built, *why* those choices were
made, *how to run and deploy it*, and *every failure mode we've already paid for
once*.

> **Maintenance rule:** when you change behaviour, update the relevant page in
> the same change. Docs that drift are worse than no docs. Each page has a
> "Last reviewed" date — bump it when you touch the page.

---

## How to read this

The pages are numbered and meant to be read in order the first time, then used
as reference. Start with the Overview, then Architecture; dip into the rest as
needed.

| # | Page | What it covers |
|---|------|----------------|
| 01 | [Overview](01-overview.md) | Product, principles, game catalog, glossary |
| 02 | [Architecture](02-architecture.md) | System diagram, components, request/data flow |
| 03 | [Backend](03-backend.md) | Spring Boot server: packages, services, conventions |
| 04 | [Frontend](04-frontend.md) | Expo app: routing, state, API client, theming, i18n |
| 05 | [Real-time gameplay](05-realtime.md) | The "ping → refetch" model + polling fallback |
| 06 | [Environment setup](06-environment-setup.md) | Run backend & frontend locally; all env vars |
| 07 | [Deployment](07-deployment.md) | Railway + Netlify + Cloudflare topology |
| 08 | [Database & migrations](08-database-and-migrations.md) | Flyway, schema history, rules |
| 09 | [Security](09-security.md) | Auth, JWT + token versioning, rate limiting, anti-cheat |
| 10 | [Friend-invite links](10-invite-links.md) | The tappable-link join feature, end to end |
| 11 | [Failure modes & gotchas](11-failure-modes.md) | War stories — read before debugging |
| 12 | [Observability & roadmap](12-observability-and-roadmap.md) | Monitoring + planned work |

---

## 30-second orientation

```
Clients (iOS / Android / Web)
        │  REST over HTTPS  +  STOMP over WSS
        ▼
Spring Boot API  ──►  PostgreSQL (Supabase)   durable state, Flyway-managed
(authoritative)  ──►  Redis (Upstash)          rate limiting + cache
        │
        ├─ Web   → Netlify   → https://gridclanpuzzle.win
        └─ API   → Railway   → https://api.gridclanpuzzle.win
                   DNS → Cloudflare (api subdomain MUST be DNS-only)
```

| Thing | Where |
|---|---|
| Repo root | `GRIDCLAN PROJECT/` (parent of the two sub-projects) |
| Backend | `gridclan-backend/` — Java 21 / Spring Boot 3.3 |
| Frontend | `gridclan-frontend/` — Expo SDK 51 (native + web) |
| Prod web | https://gridclanpuzzle.win (Netlify) |
| Prod API / WS | https://api.gridclanpuzzle.win, `wss://…/ws` (Railway) |
| DB / cache | Supabase Postgres / Upstash Redis |
| Migrations head | `V19` |

See also the per-project READMEs (`gridclan-backend/README.md`,
`gridclan-frontend/README.md`) and `CLAUDE.md` for AI-assistant conventions.

_Last reviewed: 2026-06-28._
