# 04 · Frontend

[← Backend](03-backend.md) · [Index](README.md) · [Next: Real-time gameplay →](05-realtime.md)

---

**Stack:** React Native + **Expo SDK 51** · expo-router · Redux Toolkit +
redux-persist · axios · react-i18next · TypeScript (strict). One codebase ships
to **iOS, Android, and the web** (static export).

## Directory layout

```
gridclan-frontend/
├── app/                     ← expo-router FILE routes (each file = a screen)
│   ├── _layout.tsx          ← root: providers, fonts, auth hydration, Stack
│   ├── (auth)/              ← login / register / forgot-password
│   ├── (tabs)/              ← home, tournament, profile, …
│   ├── game/[sessionId].tsx ← solo game (fullScreenModal)
│   ├── scrabble/  gomoku/  battleship/   ← new.tsx (lobby) + [id].tsx (game)
│   ├── challenge/           ← new.tsx + [code].tsx (async challenge hub)
│   └── j/[game]/[code].tsx  ← AUTO-JOIN by invite link (2026-06-28)
├── src/
│   ├── api/                 ← client.ts (axios) + index.ts (typed endpoints)
│   ├── store/               ← Redux slices (auth, points, game, …)
│   ├── components/          ← ui/ design system + ErrorBoundary, WebContainer
│   ├── services/            ← sound, errorReporter, activityTracker, deviceSecurity
│   ├── websocket/           ← stompClient, gameSocket, chatClient
│   ├── theme/               ← Colors, useColors/useTheme, makeStyles
│   ├── utils/               ← invite.ts, confirm.ts, secureStorage.ts
│   ├── i18n/                ← index.ts + locales/*.json (6 languages)
│   └── data/                ← static data (countries, …)
├── app.json / app.config.js ← static + dynamic Expo config
└── eas.json                 ← native build profiles
```

## Routing (expo-router)

File-based. Folders map to URL segments; `[param]` files are dynamic; `(group)`
folders organize without adding a path segment. **Typed routes are on**
(`experiments.typedRoutes`), so navigation targets are type-checked.

> **Gotcha:** a destination built from a *variable* prefix (e.g.
> `` `/${game}/${id}` ``) doesn't satisfy the generated `Href` type — cast it
> (`as never`). A literal-prefixed template like `` `/scrabble/${id}` `` is fine.

The root `_layout.tsx` registers the Stack, hydrates auth before hiding the
splash, loads fonts/i18n/sound prefs, and lets guests browse the `(tabs)` while
redirecting authed users away from `(auth)`.

## State management

- **Redux Toolkit** slices in `src/store` (auth, points, game, …), persisted with
  redux-persist.
- **Auth tokens** are stored in `expo-secure-store` (`src/utils/secureStorage`),
  not in plain persisted state.
- `authSlice` holds `userId`/`role`; `userId === null` means guest. Guests can
  browse but are routed to register when they try to play.

## API client (`src/api`)

- `client.ts` — axios instance with:
  - **Request interceptor:** attaches the access token.
  - **Response interceptor:** on 401, auto-refreshes the token once and replays
    the request; concurrent 401s share a single refresh via a queue.
  - Optional **certificate pinning** in production builds (`pinnedAdapter`).
  - Base URL from `Constants.expoConfig.extra.API_BASE_URL`.
- `index.ts` — typed endpoint groups: `gameApi`, `pointsApi`, `gemsApi`,
  `profileApi`, `communityApi`, `tournamentApi`, `scrabbleApi`, `gomokuApi`,
  `battleshipApi`, `challengeApi`, `presenceApi`. Each game's `join(code)`
  returns a view containing `gameId`, which the [invite links](10-invite-links.md)
  feature uses to redirect into the live game.

## Theming

Light/dark via `useColors()` / `useTheme()`. Every screen builds styles with the
`makeStyles(Colors)` pattern and memoizes them. `Colors` (dark) is the fallback.
The migration to this pattern is complete except `ErrorBoundary`.

## Internationalization

`react-i18next`, 6 languages: **en, fr, hi, pt, sw, tl**. **`en.json` is the
source of truth**; other locales fall back to it.

> **Critical gotcha:** `t('key', 'inline default')` only uses the inline default
> when the key is *missing entirely*. If `en.json` defines the key, that value
> wins. So when you change copy, **edit `en.json`** — don't rely on the inline
> default. (This is exactly why the invite feature edited `en.json`.)

## Web-specific guards

- `Platform.OS === 'web'` gates all web-only behaviour (share API, cursor styles,
  confirm dialogs).
- **`Alert.alert` action buttons don't fire on RN-Web.** Use `src/utils/confirm.ts`
  (falls back to `window.confirm`) for any confirm-gated action. See
  [Failure modes](11-failure-modes.md).
- `WebContainer` constrains the web layout to a centered ~1100px column;
  desktop-width home uses a two-column layout.

## Commands

```bash
cd gridclan-frontend
npm install
npm start              # Expo dev server
npm run android        # Android emulator
npm run ios            # iOS simulator
npm test               # Jest (jest-expo)
npx tsc --noEmit       # typecheck (strict; run before pushing)
npx expo export --platform web   # what Netlify builds
```

---

[← Backend](03-backend.md) · [Index](README.md) · [Next: Real-time gameplay →](05-realtime.md)

_Last reviewed: 2026-06-28._
