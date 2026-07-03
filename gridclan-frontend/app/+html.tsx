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
            {/* The arc letters live here — created by the timeline script as
                HTML spans (SVG textPath glyphs can't fly), so the buddy below
                can KICK each one up into its slot on the circle. */}
            <div className="gc-word-layer" />
            <div className="gc-emblem">
              <img className="gc-piece gc-p0" src="/splash-piece-0.png" alt="" />
              <img className="gc-piece gc-p1" src="/splash-piece-1.png" alt="" />
              <img className="gc-piece gc-p2" src="/splash-piece-2.png" alt="" />
              <img className="gc-piece gc-p3" src="/splash-piece-3.png" alt="" />
            </div>
            {/* The cartoon buddy who kicks the letters in, then smiles */}
            <div className="gc-buddy">
              <div className="gc-b-body">
                <div className="gc-b-eyes"><span /><span /></div>
                <div className="gc-b-cheeks"><span /><span /></div>
                <div className="gc-b-mouth" />
              </div>
              <div className="gc-b-legs">
                <span className="gc-b-leg" />
                <span className="gc-b-leg gc-b-kickleg" />
              </div>
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
  animation: gcSafety 0.6s ease 10.5s forwards;
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
#gc-splash .gc-word-layer {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(88vw, 360px); height: min(88vw, 360px); overflow: visible;
}
#gc-splash .gc-kl {
  position: absolute; opacity: 0; will-change: transform;
  font-family: 'Rye','Bevan',serif; font-weight: 700; line-height: 1;
  /* Light cream "carved" rim so every letter — including the near-black one —
     reads on the dark backdrop while keeping the wood-type look. */
  -webkit-text-stroke: 1.2px #efe2b8;
  text-shadow: 0 2px 2px rgba(0,0,0,.55);
}
#gc-splash .gc-kl.in {
  opacity: 1;
  transition: transform 0.44s cubic-bezier(.2,.9,.25,1.3), opacity 0.22s ease;
}

/* The buddy — a round yellow fellow below the emblem doing the kicking */
#gc-splash .gc-buddy {
  position: absolute; left: 50%;
  top: calc(50% + min(44vw, 180px) + 2px);
  transform: translateX(-50%) scale(0);
  display: flex; flex-direction: column; align-items: center;
  filter: drop-shadow(0 5px 10px rgba(0,0,0,.45));
}
#gc-splash .gc-buddy.in {
  transform: translateX(-50%) scale(1);
  transition: transform 0.35s cubic-bezier(.2,.9,.25,1.4);
}
#gc-splash .gc-b-body {
  position: relative; width: 62px; height: 62px; border-radius: 50%;
  background: #ffd34d; border: 3px solid #e8a900;
  display: flex; flex-direction: column; align-items: center;
}
#gc-splash .gc-buddy.kick .gc-b-body { animation: gcLean 0.24s ease; }
@keyframes gcLean {
  0% { transform: none; } 30% { transform: rotate(5deg) translateY(1px); }
  65% { transform: rotate(-9deg) translateY(-4px); } 100% { transform: none; }
}
#gc-splash .gc-b-eyes { display: flex; gap: 9px; margin-top: 15px; }
#gc-splash .gc-b-eyes span {
  width: 13px; height: 13px; border-radius: 50%;
  background: #fff; border: 2px solid #3a2b00; position: relative;
}
#gc-splash .gc-b-eyes span::after {
  content: ''; position: absolute; left: 3px; top: 3px;
  width: 5px; height: 5px; border-radius: 50%; background: #3a2b00;
}
/* Happy eyes: closed "^ ^" arcs */
#gc-splash .gc-buddy.happy .gc-b-eyes span {
  height: 7px; background: transparent; border: none;
  border-top: 3px solid #3a2b00; border-radius: 7px 7px 0 0; margin-top: 3px;
}
#gc-splash .gc-buddy.happy .gc-b-eyes span::after { display: none; }
#gc-splash .gc-b-cheeks {
  display: none; position: absolute; top: 28px; left: 0; right: 0;
  justify-content: space-between; padding: 0 6px;
}
#gc-splash .gc-buddy.happy .gc-b-cheeks { display: flex; }
#gc-splash .gc-b-cheeks span {
  width: 8px; height: 8px; border-radius: 50%; background: rgba(255,110,110,.7);
}
#gc-splash .gc-b-mouth {
  width: 11px; height: 3px; border-radius: 2px; background: #7a4a00; margin-top: 9px;
}
#gc-splash .gc-buddy.happy .gc-b-mouth {
  width: 26px; height: 13px; border-radius: 0 0 13px 13px; background: #7a3a00; margin-top: 6px;
}
#gc-splash .gc-b-legs { display: flex; gap: 11px; margin-top: -3px; }
#gc-splash .gc-b-leg {
  position: relative; width: 8px; height: 19px; border-radius: 4px; background: #e8a900;
}
#gc-splash .gc-b-leg::after {  /* shoe */
  content: ''; position: absolute; left: -4px; bottom: -3px;
  width: 17px; height: 8px; border-radius: 4px; background: #37455b;
}
#gc-splash .gc-b-kickleg { transform-origin: top center; }
#gc-splash .gc-buddy.kick .gc-b-kickleg { animation: gcKick 0.24s ease; }
@keyframes gcKick {
  0% { transform: none; } 30% { transform: rotate(-30deg); }
  65% { transform: rotate(55deg); } 100% { transform: none; }
}
#gc-splash .gc-buddy.happy { animation: gcHop 0.65s ease 0.1s; }
@keyframes gcHop {
  0%, 100% { transform: translateX(-50%) scale(1); }
  25% { transform: translateX(-50%) translateY(-16px) scale(1); }
  50% { transform: translateX(-50%) scale(1); }
  70% { transform: translateX(-50%) translateY(-9px) scale(1); }
}
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
  var layer = splash.querySelector('.gc-word-layer');
  var buddy = splash.querySelector('.gc-buddy');

  // ---- Arc letters (built as HTML spans so they can be kicked into place) --
  // Geometry mirrors the old SVG textPath: a 360-unit circle, r=132, GRIDCLAN
  // arched over the top, PUZZLES under the bottom. Positions are set in % of
  // the layer so they scale with the viewport; the kick-flight offset (from
  // the buddy's boot below the circle) is computed in px at reveal time.
  var arcLetters = [];
  (function () {
    var topW = 'GRIDCLAN', botW = 'PUZZLES';
    var cols = ['#2fd06a', '#e23b3b', '#ffffff', '#3f86ff', '#14212e'];
    var i, a;
    for (i = 0; i < topW.length; i++) {
      a = (-90 + (i - (topW.length - 1) / 2) * 13) * Math.PI / 180;
      arcLetters.push({ ch: topW[i], col: cols[i % cols.length],
        x: 180 + 132 * Math.cos(a), y: 180 + 132 * Math.sin(a),
        rot: a * 180 / Math.PI + 90, size: 36 });
    }
    for (i = 0; i < botW.length; i++) {
      a = (90 - (i - (botW.length - 1) / 2) * 12.5) * Math.PI / 180;
      arcLetters.push({ ch: botW[i], col: cols[(i + 3) % cols.length],
        x: 180 + 132 * Math.cos(a), y: 180 + 132 * Math.sin(a),
        rot: a * 180 / Math.PI - 90, size: 32 });
    }
  })();
  var letterEls = [];
  function buildLetters() {
    var s = layer.getBoundingClientRect().width / 360;
    arcLetters.forEach(function (L, i) {
      var el = document.createElement('span');
      el.className = 'gc-kl';
      el.textContent = L.ch;
      el.style.color = L.col;
      el.style.fontSize = (L.size * s) + 'px';
      el.style.left = (L.x / 360 * 100) + '%';
      el.style.top  = (L.y / 360 * 100) + '%';
      // Start at the buddy's boot (below the circle's bottom), spun & small.
      var dx = (180 - L.x) * s, dy = (392 - L.y) * s;
      el.style.transform = 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) ' +
        'rotate(' + (i % 2 ? -200 : 160) + 'deg) scale(.4)';
      el.dataset.final = 'translate(-50%,-50%) rotate(' + L.rot + 'deg)';
      layer.appendChild(el);
      letterEls.push(el);
    });
  }
  function kickBuddy() {
    buddy.classList.remove('kick');
    void buddy.offsetWidth;          // restart the kick animation
    buddy.classList.add('kick');
  }

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

  // A little "bubble" pop for each GRIDCLAN / PUZZLES letter landing.
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

  // A happy three-note chirp for the buddy's smile at the end.
  function yay() {
    var c = ac(); if (!c) return; var t = c.currentTime;
    [523, 659, 784].forEach(function (f, i) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      var s = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.14, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
      o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + 0.25);
    });
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
    buildLetters();
    for (var i = 0; i < pieces.length; i++) pieces[i].classList.add('in');
    letterEls.forEach(function (el) {
      el.style.transition = 'none';
      el.style.transform = el.dataset.final;
      el.classList.add('in');
    });
    buddy.classList.add('in', 'happy');
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

  // The buddy hops up and KICKS the GRIDCLAN / PUZZLES letters into their
  // arc slots one per kick, then breaks into a smile and does a happy hop.
  at(act2Start, buildLetters);
  at(settleAt + 160, function () { buddy.classList.add('in'); });
  var kickStart = settleAt + 420, kickStep = 160;
  arcLetters.forEach(function (_, i) {
    at(kickStart + i * kickStep, function () {
      kickBuddy(); swoosh();
      var el = letterEls[i];
      el.classList.add('in');
      el.style.transform = el.dataset.final;
    });
    at(kickStart + i * kickStep + 430, bubble);   // the letter lands
  });
  var smileAt = kickStart + arcLetters.length * kickStep + 300;
  at(smileAt, function () { buddy.classList.remove('kick'); buddy.classList.add('happy'); yay(); });
  at(smileAt + 1500, finish);
})();
`;
