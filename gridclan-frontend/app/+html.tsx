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
          content="GridClan Puzzles is a free, competitive, skill-based puzzle game with four games — Word Search Grid, Grid Connect, Grid Battleships and Grid Scrabble. Challenge a friend in real time, climb the leaderboards and join communities. No pay-to-play, ever."
        />
        <meta
          name="keywords"
          content="GridClan Puzzles, puzzle game, free puzzle game, competitive puzzles, skill game, Word Search Grid, Grid Connect, Grid Battleships, Grid Scrabble, word search, five in a row, gomoku, battleship, scrabble, play with friends, brain games, online puzzles"
        />
        <meta name="theme-color" content="#07172e" />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="GridClan Puzzles" />
        <link rel="canonical" href="https://gridclanpuzzle.win/" />

        {/* Favicons — GridClan shield emblem */}
        <link rel="icon" type="image/png" sizes="any" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icon-512.png" />

        {/* Intro typefaces — a Zapf-Chancery-style calligraphic italic for
            "ETHELES STUDIO" (falls back to the system Z003 / URW Chancery if
            present) and a wood-type display face for "GRIDCLAN PUZZLES". */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,700&family=Rye&display=swap"
        />

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
          content="Play four free, skill-based games — Word Search Grid, Grid Connect, Grid Battleships and Grid Scrabble. Challenge a friend in real time. No pay-to-play, ever."
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
          content="Play four free, skill-based games — Word Search Grid, Grid Connect, Grid Battleships and Grid Scrabble. Challenge a friend in real time. No pay-to-play, ever."
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
              'A free, competitive, skill-based puzzle game with four games — Word Search Grid, Grid Connect, Grid Battleships and Grid Scrabble. Challenge a friend in real time, climb the leaderboards and join communities.',
            gameItem: [
              { '@type': 'Thing', name: 'Word Search Grid' },
              { '@type': 'Thing', name: 'Grid Connect' },
              { '@type': 'Thing', name: 'Grid Battleships' },
              { '@type': 'Thing', name: 'Grid Scrabble' },
            ],
            applicationCategory: 'GameApplication',
            genre: 'Puzzle',
            playMode: 'MultiPlayer',
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
        {/* Opening intro — two acts, driven by the inline timeline script below
            so the synthesized sounds stay in sync with the visuals:
              1. "ETHELES STUDIO" letters swoosh in (with a green/black/white
                 hexagon studio mark dropping in above them);
              2. the GridClan emblem assembles with metallic "ting" hits, then
                 "GRIDCLAN" / "PUZZLES" curve in around it with bubble pops.
            Tap anywhere to skip (that tap also unlocks audio for the rest). */}
        <div id="gc-splash" aria-hidden="true">

          {/* ── Act 1: ETHELES STUDIO ─────────────────────────────────── */}
          <div className="gc-stage gc-etheles">
            <div className="gc-eth-hex">
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                <polygon points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5"
                  fill="#0b100d" stroke="#2fd06a" strokeWidth="6" strokeLinejoin="round" />
                <polygon points="50,17 79,33.5 79,66.5 50,83 21,66.5 21,33.5"
                  fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" />
                <text x="50" y="52" textAnchor="middle" dominantBaseline="central"
                  fontFamily="'Z003','URW Chancery L','Apple Chancery','Cormorant Garamond',serif"
                  fontStyle="italic" fontWeight="700" fontSize="44" fill="#ffffff">E</text>
              </svg>
            </div>
            <div className="gc-eth-word">
              <span className="gc-l" style={{ color: '#2fd06a' }}>E</span>
              <span className="gc-l" style={{ color: '#ffffff' }}>T</span>
              <span className="gc-l" style={{ color: '#2fd06a' }}>H</span>
              <span className="gc-l" style={{ color: '#ffffff' }}>E</span>
              <span className="gc-l" style={{ color: '#2fd06a' }}>L</span>
              <span className="gc-l" style={{ color: '#ffffff' }}>E</span>
              <span className="gc-l" style={{ color: '#2fd06a' }}>S</span>
              <span className="gc-sp" />
              <span className="gc-l" style={{ color: '#ffffff' }}>S</span>
              <span className="gc-l" style={{ color: '#2fd06a' }}>T</span>
              <span className="gc-l" style={{ color: '#ffffff' }}>U</span>
              <span className="gc-l" style={{ color: '#2fd06a' }}>D</span>
              <span className="gc-l" style={{ color: '#ffffff' }}>I</span>
              <span className="gc-l" style={{ color: '#2fd06a' }}>O</span>
            </div>
          </div>

          {/* ── Act 2: GRIDCLAN PUZZLES ───────────────────────────────── */}
          <div className="gc-stage gc-grid">
            <svg className="gc-arc" viewBox="0 0 360 360" aria-hidden="true">
              <defs>
                <path id="gcArcTop" d="M 48 180 A 132 132 0 0 1 312 180" />
                <path id="gcArcBot" d="M 48 180 A 132 132 0 0 0 312 180" />
              </defs>
              <text className="gc-arc-text" fontSize="36">
                <textPath href="#gcArcTop" startOffset="50%" textAnchor="middle">
                  <tspan className="gc-sl" fill="#2fd06a">G</tspan>
                  <tspan className="gc-sl" fill="#e23b3b">R</tspan>
                  <tspan className="gc-sl" fill="#ffffff">I</tspan>
                  <tspan className="gc-sl" fill="#3f86ff">D</tspan>
                  <tspan className="gc-sl" fill="#14212e">C</tspan>
                  <tspan className="gc-sl" fill="#2fd06a">L</tspan>
                  <tspan className="gc-sl" fill="#e23b3b">A</tspan>
                  <tspan className="gc-sl" fill="#ffffff">N</tspan>
                </textPath>
              </text>
              <text className="gc-arc-text" fontSize="32">
                <textPath href="#gcArcBot" startOffset="50%" textAnchor="middle">
                  <tspan className="gc-sl" fill="#3f86ff">P</tspan>
                  <tspan className="gc-sl" fill="#2fd06a">U</tspan>
                  <tspan className="gc-sl" fill="#e23b3b">Z</tspan>
                  <tspan className="gc-sl" fill="#ffffff">Z</tspan>
                  <tspan className="gc-sl" fill="#14212e">L</tspan>
                  <tspan className="gc-sl" fill="#3f86ff">E</tspan>
                  <tspan className="gc-sl" fill="#2fd06a">S</tspan>
                </textPath>
              </text>
            </svg>
            <div className="gc-emblem">
              <img className="gc-piece gc-p0" src="/splash-piece-0.png" alt="" />
              <img className="gc-piece gc-p1" src="/splash-piece-1.png" alt="" />
              <img className="gc-piece gc-p2" src="/splash-piece-2.png" alt="" />
              <img className="gc-piece gc-p3" src="/splash-piece-3.png" alt="" />
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
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

/* ── Opening intro overlay ─────────────────────────────────────────────── */
#gc-splash {
  position: fixed; inset: 0; z-index: 9999; overflow: hidden; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 45%, #0e2440 0%, #051124 70%);
  -webkit-tap-highlight-color: transparent;
  /* Safety net: if the timeline script never runs (JS disabled / error), the
     overlay still gets out of the way instead of trapping the user. */
  animation: gcSafety 0.6s ease 8s forwards;
}
#gc-splash.gc-out { opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 0.55s ease, visibility 0.55s ease; }
@keyframes gcSafety { to { opacity: 0; visibility: hidden; pointer-events: none; } }

#gc-splash .gc-stage {
  position: absolute; inset: 0; opacity: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
#gc-splash .gc-stage.gc-show { opacity: 1; }
#gc-splash .gc-stage.gc-fade { opacity: 0; transition: opacity 0.4s ease; }

/* Act 1 — ETHELES STUDIO */
#gc-splash .gc-eth-hex {
  width: 76px; height: 76px; margin-bottom: 16px;
  opacity: 0; transform: scale(.35) translateY(10px) rotate(-14deg);
  filter: drop-shadow(0 6px 14px rgba(0,0,0,.5));
}
#gc-splash .gc-eth-hex.in {
  opacity: 1; transform: none;
  transition: transform 0.5s cubic-bezier(.2,.9,.25,1.35), opacity 0.4s ease;
}
#gc-splash .gc-eth-word {
  font-family: 'Z003','URW Chancery L','Apple Chancery','Cormorant Garamond',serif;
  font-style: italic; font-weight: 700; white-space: nowrap;
  font-size: clamp(30px, 8vw, 56px); letter-spacing: 1px;
  text-shadow: 0 2px 0 #000, 0 3px 10px rgba(0,0,0,.6), 0 0 16px rgba(47,208,106,.3);
}
#gc-splash .gc-eth-word .gc-l {
  display: inline-block; opacity: 0;
  transform: translateY(-24px) rotate(-9deg) scale(.55);
}
#gc-splash .gc-eth-word .gc-l.in {
  opacity: 1; transform: none;
  transition: transform 0.42s cubic-bezier(.2,.9,.25,1.3), opacity 0.3s ease;
}
#gc-splash .gc-eth-word .gc-sp { display: inline-block; width: .34em; }

/* Act 2 — GRIDCLAN PUZZLES */
#gc-splash .gc-arc { position: absolute; width: min(88vw, 360px); height: min(88vw, 360px); overflow: visible; }
#gc-splash .gc-arc-text {
  font-family: 'Rye','Bevan',serif; font-weight: 700;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.55));
}
#gc-splash .gc-sl {
  opacity: 0;
  /* Light cream "carved" rim so every letter — including the near-black one —
     reads on the dark backdrop while keeping the wood-type look. */
  paint-order: stroke; stroke: #efe2b8; stroke-width: 1.7px;
}
#gc-splash .gc-sl.in { opacity: 1; transition: opacity 0.3s ease; }
#gc-splash .gc-emblem { position: relative; width: 174px; height: 174px; }
#gc-splash .gc-piece {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0;
}
#gc-splash .gc-p0 { transform: translate(-48px,-48px) scale(.62) rotate(-12deg); }
#gc-splash .gc-p1 { transform: translate( 48px,-48px) scale(.62) rotate( 12deg); }
#gc-splash .gc-p2 { transform: translate(-48px, 48px) scale(.62) rotate( 12deg); }
#gc-splash .gc-p3 { transform: translate( 48px, 48px) scale(.62) rotate(-12deg); }
#gc-splash .gc-piece.in {
  opacity: 1; transform: translate(0,0) scale(1) rotate(0deg);
  transition: transform 0.6s cubic-bezier(.22,.9,.27,1.3), opacity 0.35s ease;
}
#gc-splash .gc-emblem.settle { animation: gcSettle 0.5s ease; }
@keyframes gcSettle {
  0% { transform: scale(1); } 45% { transform: scale(1.06); } 100% { transform: scale(1); }
}
`;

// Intro timeline + synthesized audio. Kept as a plain inline script so it runs
// immediately (before/while the RN-Web bundle hydrates) and so the swoosh /
// metallic-ting / bubble sounds stay frame-synced with the visual reveals.
const splashScript = `
(function () {
  var splash = document.getElementById('gc-splash');
  if (!splash) return;
  var act1 = splash.querySelector('.gc-etheles');
  var act2 = splash.querySelector('.gc-grid');
  var hex  = splash.querySelector('.gc-eth-hex');
  var emblem = splash.querySelector('.gc-emblem');
  var letters = splash.querySelectorAll('.gc-eth-word .gc-l');
  var pieces  = splash.querySelectorAll('.gc-piece');
  var arcTexts = splash.querySelectorAll('.gc-arc-text');
  var gridGlyphs = arcTexts[0] ? arcTexts[0].querySelectorAll('.gc-sl') : [];
  var puzzGlyphs = arcTexts[1] ? arcTexts[1].querySelectorAll('.gc-sl') : [];

  // ---- Web Audio (best-effort; browsers may block until a gesture) --------
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null;
  function ac() {
    if (!AC) return null;
    try { if (!actx) actx = new AC(); } catch (e) { return null; }
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  // Unlock audio on the first interaction so later cues can still be heard.
  function unlock() { ac(); }
  ['pointerdown','keydown','touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { once: true, passive: true });
  });

  // A soft "swoosh" + low body-hit for each ETHELES letter.
  function swoosh() {
    var c = ac(); if (!c) return; var t = c.currentTime;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2);
    var n = c.createBufferSource();
    var buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.18), c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950, t);
    bp.frequency.exponentialRampToValueAtTime(320, t + 0.16);
    var ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(bp); bp.connect(ng); ng.connect(c.destination); n.start(t); n.stop(t + 0.18);
  }

  // Bright metallic "ting" (hammer-on-metal) for the emblem pieces.
  function ting(base) {
    var c = ac(); if (!c) return; var t = c.currentTime;
    var f = base || 2300;
    [[1, 0.2], [2.01, 0.07], [2.97, 0.05]].forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p[1], t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.4);
    });
  }

  // A little "bubble" pop for each GRIDCLAN / PUZZLES letter.
  function bubble() {
    var c = ac(); if (!c) return; var t = c.currentTime;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(720 + Math.random() * 140, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.15);
  }

  var timers = [];
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  var finished = false;
  function finish() {
    if (finished) return; finished = true;
    timers.forEach(clearTimeout);
    splash.classList.add('gc-out');
    setTimeout(function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); }, 650);
  }
  // Tap to skip (and that gesture unlocks audio for the rest of any replay).
  splash.addEventListener('click', function () { unlock(); finish(); });

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    // Honour reduced-motion: reveal the final brand mark briefly, no animation.
    act2.classList.add('gc-show');
    for (var i = 0; i < pieces.length; i++) pieces[i].classList.add('in');
    for (var j = 0; j < gridGlyphs.length; j++) gridGlyphs[j].classList.add('in');
    for (var k = 0; k < puzzGlyphs.length; k++) puzzGlyphs[k].classList.add('in');
    at(1400, finish);
    return;
  }

  // ---- Act 1: ETHELES STUDIO ---------------------------------------------
  act1.classList.add('gc-show');
  var t = 220, step = 95;
  letters.forEach(function (el, i) {
    at(t + i * step, function () { el.classList.add('in'); swoosh(); });
  });
  var afterLetters = t + letters.length * step; // ~1455ms
  at(afterLetters + 120, function () { hex.classList.add('in'); ting(1500); });

  // ---- Cross-fade to Act 2 ------------------------------------------------
  var act2Start = afterLetters + 900; // ~2355ms
  at(act2Start - 100, function () { act1.classList.add('gc-fade'); });
  at(act2Start, function () { act2.classList.add('gc-show'); });

  // Emblem pieces hammer into place.
  var pieceStart = act2Start + 200, pieceStep = 200;
  pieces.forEach(function (el, i) {
    at(pieceStart + i * pieceStep, function () { el.classList.add('in'); ting(2200 + i * 130); });
  });
  var settleAt = pieceStart + pieces.length * pieceStep + 60;
  at(settleAt, function () { emblem.classList.add('settle'); ting(2700); });

  // GRIDCLAN (top) and PUZZLES (bottom) bubble in around the emblem.
  var wordStart = settleAt + 220, wordStep = 80;
  gridGlyphs.forEach(function (el, i) {
    at(wordStart + i * wordStep, function () { el.classList.add('in'); bubble(); });
  });
  puzzGlyphs.forEach(function (el, i) {
    at(wordStart + 220 + i * wordStep, function () { el.classList.add('in'); bubble(); });
  });

  var holdEnd = wordStart + 220 + Math.max(gridGlyphs.length, puzzGlyphs.length) * wordStep + 900;
  at(holdEnd, finish);
})();
`;
