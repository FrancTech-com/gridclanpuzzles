// Web-only document shell for expo-router static rendering (output: 'static').
// expo-router ignores this file on native; it wraps every statically rendered
// page on web, so it's where the <head> (title, meta, theme) belongs.
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover for safe areas; mobile-app feel on phones */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>GridClan Puzzles — Free Competitive Skill Puzzle Game</title>
        <meta
          name="description"
          content="GridClan Puzzles is a free, competitive, skill-based puzzle game. Play Grid Lockdown, Sum Cipher and Linked Rush, climb the leaderboards and join communities — no pay-to-play, ever."
        />
        <meta
          name="keywords"
          content="GridClan Puzzles, puzzle game, free puzzle game, competitive puzzles, skill game, Grid Lockdown, Sum Cipher, Linked Rush, brain games, online puzzles"
        />
        <meta name="theme-color" content="#07172e" />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="GridClan Puzzles" />
        <link rel="canonical" href="https://gridclanpuzzle.win/" />

        {/* Favicons — GridClan shield emblem */}
        <link rel="icon" type="image/png" sizes="any" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icon-512.png" />

        {/* PWA — installable, offline-capable */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GridClan" />
        <script
          dangerouslySetInnerHTML={{ __html: `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}` }}
        />

        {/* Open Graph (Facebook, WhatsApp, LinkedIn, etc.) */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="GridClan Puzzles" />
        <meta property="og:title" content="GridClan Puzzles — Free Competitive Skill Puzzle Game" />
        <meta
          property="og:description"
          content="Play free, competitive, skill-based puzzles — Grid Lockdown, Sum Cipher and Linked Rush. Climb the leaderboards. No pay-to-play, ever."
        />
        <meta property="og:url" content="https://gridclanpuzzle.win/" />
        <meta property="og:image" content="https://gridclanpuzzle.win/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="GridClan Puzzles hexagon logo" />

        {/* Twitter / X card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GridClan Puzzles — Free Competitive Skill Puzzle Game" />
        <meta
          name="twitter:description"
          content="Play free, competitive, skill-based puzzles — Grid Lockdown, Sum Cipher and Linked Rush. No pay-to-play, ever."
        />
        <meta name="twitter:image" content="https://gridclanpuzzle.win/og-image.png" />

        {/* Structured data for rich search results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'VideoGame',
            name: 'GridClan Puzzles',
            url: 'https://gridclanpuzzle.win/',
            image: 'https://gridclanpuzzle.win/og-image.png',
            description:
              'A free, competitive, skill-based puzzle game. Play Grid Lockdown, Sum Cipher and Linked Rush, climb the leaderboards and join communities.',
            applicationCategory: 'GameApplication',
            genre: 'Puzzle',
            operatingSystem: 'Android, iOS, Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          }) }}
        />

        {/* Resets RN ScrollView quirks on web. */}
        <ScrollViewStyleReset />

        {/* Keep the page background dark so there's no white flash before the
            app mounts and the desktop backdrop stays consistent. */}
        <style dangerouslySetInnerHTML={{ __html: backgroundCss }} />
      </head>
      <body>
        {/* Opening animation — the emblem's parts fly in and assemble, then the
            overlay fades to reveal the app. Pure CSS so it runs before/while the
            JS bundle hydrates. */}
        <div id="gc-splash" aria-hidden="true">
          <div className="gc-emblem">
            <img className="gc-piece gc-p0" src="/splash-piece-0.png" alt="" />
            <img className="gc-piece gc-p1" src="/splash-piece-1.png" alt="" />
            <img className="gc-piece gc-p2" src="/splash-piece-2.png" alt="" />
            <img className="gc-piece gc-p3" src="/splash-piece-3.png" alt="" />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}

const backgroundCss = `
html, body { background-color: #051124; }
/* Use dynamic viewport height (dvh) so the bottom tab bar isn't hidden behind
   mobile browser chrome (address bar / toolbar); 100vh is a fallback for
   browsers without dvh support. On desktop the two are equivalent. */
#root { display: flex; min-height: 100vh; min-height: 100dvh; }

/* ── Opening splash: emblem pieces assemble, then fade out ─────────────── */
#gc-splash {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 45%, #0e2440 0%, #051124 70%);
  animation: gcSplashOut 0.55s ease 1.65s forwards;
}
#gc-splash .gc-emblem {
  position: relative; width: 200px; height: 200px;
  animation: gcSettle 0.5s ease 1.15s both;
}
#gc-splash .gc-piece {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0;
  animation: gcAssemble 0.7s cubic-bezier(0.22, 0.9, 0.27, 1.2) both;
}
#gc-splash .gc-p0 { transform: translate(-44px,-44px) scale(.7) rotate(-10deg); animation-delay: 0s;    }
#gc-splash .gc-p1 { transform: translate( 44px,-44px) scale(.7) rotate( 10deg); animation-delay: .12s; }
#gc-splash .gc-p2 { transform: translate(-44px, 44px) scale(.7) rotate( 10deg); animation-delay: .24s; }
#gc-splash .gc-p3 { transform: translate( 44px, 44px) scale(.7) rotate(-10deg); animation-delay: .36s; }
@keyframes gcAssemble {
  to { opacity: 1; transform: translate(0,0) scale(1) rotate(0deg); }
}
@keyframes gcSettle {
  0% { transform: scale(1); } 45% { transform: scale(1.05); } 100% { transform: scale(1); }
}
@keyframes gcSplashOut {
  to { opacity: 0; visibility: hidden; pointer-events: none; }
}
@media (prefers-reduced-motion: reduce) {
  #gc-splash { animation: gcSplashOut 0.3s ease 0.6s forwards; }
  #gc-splash .gc-piece { opacity: 1; transform: none; animation: none; }
  #gc-splash .gc-emblem { animation: none; }
}
`;
