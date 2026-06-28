# 10 · Friend-invite links

[← Security](09-security.md) · [Index](README.md) · [Next: Failure modes →](11-failure-modes.md)

Added 2026-06-28.

---

## The problem

To play with a friend you used to share a **code**. The friend then had to open
the app, find the right game, tap "Have a code?", and type it. That's friction
and wasted time on the recipient's side.

## The solution

Share a **tappable link** that drops the friend straight into the game.

The link targets the **public web origin** (`WEB_BASE_URL`, default
`https://gridclanpuzzle.win`), which serves the *same* expo-router app. So the
URL resolves to a real screen that joins automatically. This works for
**everyone** with zero setup — no app install, no universal-link configuration. A
friend who *does* have the native app still gets a fully playable web game; true
native universal links are a deliberate future polish (see
[Roadmap](12-observability-and-roadmap.md)).

### Link shapes

```
Real-time games   https://gridclanpuzzle.win/j/<game>/<code>     game ∈ {scrabble, gomoku, battleship}
Async challenge   https://gridclanpuzzle.win/challenge/<code>    (existing hub handles accept)
```

The format is intentionally **route-shaped** so that when native universal links
land, the same URLs can open the app with no format change.

## Moving parts

| File | Role |
|------|------|
| `src/utils/invite.ts` | `gameInviteLink()`, `challengeInviteLink()`, `shareInvite()` (OS share → Web Share API → clipboard fallback), `safeNextPath()` |
| `app/j/[game]/[code].tsx` | **Auto-join landing screen** — resolves game, joins by code, `router.replace`s into the live game; forwards `challenge` to its hub |
| `app/scrabble/[id].tsx`, `app/gomoku/[id].tsx`, `app/battleship/[id].tsx`, `app/challenge/[code].tsx` | Show the link + a "Share invite link" button, built via the util |
| `app/(auth)/login.tsx`, `app/(auth)/register.tsx` | Honor a `next` param so a logged-out invitee returns to the game after auth (validated by `safeNextPath`) |
| `app.json`, `app.config.js`, `netlify.toml` | introduce `WEB_BASE_URL` |
| `src/services/deviceSecurity.ts` | allowlist `j` / `challenge` / game prefixes for the deep-link check |
| `src/i18n/locales/en.json` | new share copy with `{{link}}`, plus the `join` namespace |

## The recipient flow

```
Tap link ─► /j/<game>/<code>
            │
            ├─ game == challenge ─► /challenge/<code>   (Accept & play in the hub)
            │
            ├─ signed in?
            │     ├─ yes ─► <game>Api.join(code) ─► router.replace(/<game>/<gameId>)  ✅ playing
            │     └─ no  ─► /(auth)/register?next=/j/<game>/<code>
            │                 └─ after register/login ─► back to /j/... ─► auto-joins
            │
            └─ bad/short link ─► friendly "this link doesn't look right" + Back
```

## How sharing works (`shareInvite`)

```
Platform.OS === 'web'
   ├─ navigator.share        → OS/browser share sheet (mobile web)
   └─ navigator.clipboard    → copy link + localized "Invite link copied"
otherwise (native)
   └─ Share.share({ message })  → native share sheet
```

The share *message* always embeds the link (most channels strip a structured
`url`), and also includes the code as a manual fallback:
`"Play Grid Connect with me! Tap to join: <link>  (or enter code <code> in the app)"`.

## Failure modes (designed-for)

| Situation | Behaviour |
|-----------|-----------|
| Bad/short/garbage link | Friendly message + Back to home; never a blank screen |
| Wrong/expired code, or game already full | `join` API rejects → friendly message |
| Double render / re-entry | `attempted` ref guards against a second join attempt |
| Guest taps link | Bounced to register carrying `next`; auto-joins after auth |
| Malicious `next` (external / `//host`) | `safeNextPath` rejects it → falls back to `/(tabs)` |
| Desktop web (no Web Share API) | `shareInvite` copies the link + shows "Invite link copied" |
| Web host without SPA redirect | Link would 404 — the Netlify `/* → /index.html` redirect prevents this |

## i18n note

`en.json` already defined `shareMessage`/`shareCta`/`sharePrompt` for each game,
so the inline `t()` defaults were **not** enough — those keys were updated in
`en.json` to include `{{link}}`, and a `join` namespace was added. Other locales
fall back to `en.json`. (See the i18n gotcha in [Frontend](04-frontend.md) and
[Failure modes](11-failure-modes.md).)

## Typed-routes note

`app/j/[game]/[code].tsx` redirects with `` router.replace(`/${game}/${id}` as never) `` —
a variable-prefix template doesn't satisfy expo-router's generated `Href` type,
so it's cast. The `next` redirects in the auth screens are cast the same way.

## How to extend

For any future "share to a friend" surface, build the URL with `src/utils/invite.ts`
and point it at a route that auto-resolves the target. Keep it route-shaped so
universal links and QR codes drop in without a format change.

---

[← Security](09-security.md) · [Index](README.md) · [Next: Failure modes →](11-failure-modes.md)

_Last reviewed: 2026-06-28._
