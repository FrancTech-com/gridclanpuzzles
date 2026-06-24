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
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
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
      <body>{children}</body>
    </html>
  );
}

const backgroundCss = `
html, body { background-color: #051124; }
#root { display: flex; min-height: 100vh; }
`;
