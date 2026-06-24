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
        <title>GridClan Puzzles</title>
        <meta
          name="description"
          content="GridClan Puzzles — a free, competitive, skill-based puzzle game. Play Grid Lockdown, Sum Cipher and Linked Rush in your browser."
        />
        <meta name="theme-color" content="#0f0f1a" />

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
html, body { background-color: #07070d; }
#root { display: flex; min-height: 100vh; }
`;
