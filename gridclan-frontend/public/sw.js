// GridClan Puzzles — service worker (PWA offline shell).
// Scope: same-origin only. The API/WebSocket live on a different origin
// (api.gridclanpuzzle.win) and are intentionally never intercepted, so auth,
// gameplay and live chat always hit the network directly.

const CACHE = 'gridclan-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/favicon.png', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave API/WS/cross-origin alone

  // Network-first for page navigations: always try fresh, fall back to the
  // cached app shell when offline so deep links still boot.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('/index.html'))),
    );
    return;
  }

  // Cache-first for same-origin static assets (hashed JS/CSS/fonts/images).
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }),
    ),
  );
});
