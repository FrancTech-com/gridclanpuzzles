// Dynamic Expo config.
//
// Expo reads app.json first and passes it in as `config`; we spread it and
// override only the values that must be environment-driven so the SAME build
// can target production (default) or a local backend during development.
//
// Local web dev against a local backend:
//   API_BASE_URL=http://localhost:8080 WS_URL=ws://localhost:8080/ws npx expo start --web
// Netlify injects the production values as build env vars (see netlify.toml).
//
// Defaults point at the production backend on Railway (api.gridclanpuzzle.win).

const PROD_API = 'https://api.gridclanpuzzle.win';
const PROD_WS = 'wss://api.gridclanpuzzle.win/ws';

module.exports = ({ config }) => ({
  ...config,
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
    ...(config.web ?? {}),
  },
  extra: {
    ...config.extra,
    API_BASE_URL: process.env.API_BASE_URL ?? config.extra?.API_BASE_URL ?? PROD_API,
    WS_URL: process.env.WS_URL ?? config.extra?.WS_URL ?? PROD_WS,
    SENTRY_DSN: process.env.SENTRY_DSN ?? config.extra?.SENTRY_DSN ?? '',
  },
});
