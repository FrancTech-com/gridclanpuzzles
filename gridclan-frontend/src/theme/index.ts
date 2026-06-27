import { Platform } from 'react-native';

// ── Palette ────────────────────────────────────────────────────────────────
// Two palettes with identical keys. `Colors` defaults to dark for back-compat
// (any code reading Colors.* directly stays dark); themed screens read the
// active palette via useColors() from '@theme/theme'.
export const darkColors = {
  // Backgrounds — deep, slightly brighter navy so the vibrant accents pop
  bg:          '#0a1b38',   // App background — deep navy
  surface:     '#122a4f',   // Cards / sheets
  surfaceHigh: '#1c3a65',   // Elevated surfaces
  border:      '#2a4d78',   // Dividers, input borders

  // Vibrant brand quartet — green / red / blue / yellow. These four are the
  // game's signature colours; the semantic keys below alias into them.
  green:    '#22c55e',
  greenDim: '#16a34a',
  red:      '#ef4444',
  redDim:   '#dc2626',
  blue:     '#3b82f6',
  blueDim:  '#2563eb',
  yellow:   '#facc15',
  yellowDim:'#eab308',

  // Brand — green primary, yellow highlight
  primary:     '#22c55e',   // Vibrant green
  primaryDim:  '#16a34a',   // Pressed state
  accent:      '#facc15',   // Yellow — score / win / highlight
  accentDim:   '#eab308',

  // Game type colours — one signature colour per game
  wordSearch:  '#facc15',   // Yellow — Word Search

  // Text
  textPrimary:   '#ffffff',
  textSecondary: '#b6cde6',
  textMuted:     '#6d88a6',

  // Status
  error:   '#ef4444',
  warning: '#facc15',
  success: '#22c55e',
  info:    '#3b82f6',

  // Points / currency
  points:  '#facc15',
  ugx:     '#22c55e',
  kes:     '#3b82f6',
  tzs:     '#fb923c',

  // Overlay
  overlay:     'rgba(3,9,20,0.65)',
  overlayLight: 'rgba(3,9,20,0.35)',
};

export type ThemeColors = typeof darkColors;

// Light palette — light backgrounds, navy text, brand teal/gold darkened for
// contrast on white. Same keys as darkColors.
export const lightColors: ThemeColors = {
  bg:          '#f4f7fb',
  surface:     '#ffffff',
  surfaceHigh: '#eaf1f8',
  border:      '#d3e0ec',

  // Same vibrant quartet, slightly deepened for contrast on white
  green:    '#16a34a',
  greenDim: '#15803d',
  red:      '#dc2626',
  redDim:   '#b91c1c',
  blue:     '#2563eb',
  blueDim:  '#1d4ed8',
  yellow:   '#d97706',
  yellowDim:'#b45309',

  primary:     '#16a34a',
  primaryDim:  '#15803d',
  accent:      '#d97706',
  accentDim:   '#b45309',

  wordSearch:  '#d97706',

  textPrimary:   '#0c2138',
  textSecondary: '#3d5a78',
  textMuted:     '#6c829a',

  error:   '#dc2626',
  warning: '#d97706',
  success: '#16a34a',
  info:    '#2563eb',

  points:  '#d97706',
  ugx:     '#16a34a',
  kes:     '#2563eb',
  tzs:     '#ea7317',

  overlay:     'rgba(12,33,56,0.45)',
  overlayLight: 'rgba(12,33,56,0.2)',
};

// Back-compat default (dark). Prefer useColors() in themed components.
export const Colors = darkColors;

// ── Spacing ────────────────────────────────────────────────────────────────
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

// ── Border radius ──────────────────────────────────────────────────────────
export const Radius = {
  sm:   6,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
} as const;

// ── Typography ─────────────────────────────────────────────────────────────
export const Font = {
  // Bumped up across the board — the old scale read too small on phones.
  size: {
    xs:   12,
    sm:   14,
    md:   16,
    lg:   20,
    xl:   25,
    xxl:  34,
    hero: 48,
  },
  weight: {
    regular: '400' as const,
    medium:  '500' as const,
    semi:    '600' as const,
    bold:    '700' as const,
    black:   '900' as const,
  },
  // Two bundled families (loaded in app/_layout via expo-font):
  //  • body    → Nunito  — soft, very readable; the app-wide default text font
  //  • display → Fredoka — rounded & chunky; titles, buttons, scores, headings
  // Each weight is its own family name (RN/Android doesn't synthesise weights
  // for custom fonts), so pick the right one rather than relying on fontWeight.
  family: {
    body:        'Nunito_400Regular',
    bodySemi:    'Nunito_600SemiBold',
    bodyBold:    'Nunito_700Bold',
    bodyBlack:   'Nunito_800ExtraBold',
    display:     'Fredoka_500Medium',
    displaySemi: 'Fredoka_600SemiBold',
    displayBold: 'Fredoka_700Bold',
    // Back-compat aliases
    sans:  'Nunito_400Regular',
    mono:  Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
} as const;

// ── Shadows ────────────────────────────────────────────────────────────────
export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  primary: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  accent: {
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
} as const;

// ── Animation durations ────────────────────────────────────────────────────
export const Duration = {
  fast:   150,
  normal: 250,
  slow:   400,
} as const;

// ── Game type metadata ─────────────────────────────────────────────────────
export const GameMeta = {
  WORD_SEARCH: {
    label:       'Word Search Grid',
    color:       Colors.wordSearch,
    description: 'Find every hidden word against the clock',
    icon:        'search',
  },
} as const;

// The three real-time 2-player games tournaments run on. `route` is the
// expo-router folder for the live game screen ( /{route}/{gameId} ).
export const TournamentGameMeta = {
  SCRABBLE:   { label: 'Grid Scrabble',    icon: '🔤', route: 'scrabble',   color: Colors.green },
  GOMOKU:     { label: 'Grid Connect',     icon: '⚫', route: 'gomoku',     color: Colors.blue },
  BATTLESHIP: { label: 'Grid Battleships', icon: '🚢', route: 'battleship', color: Colors.red },
} as const;
