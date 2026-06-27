import { Platform } from 'react-native';

// ── Palette ────────────────────────────────────────────────────────────────
// Two palettes with identical keys. `Colors` defaults to dark for back-compat
// (any code reading Colors.* directly stays dark); themed screens read the
// active palette via useColors() from '@theme/theme'.
export const darkColors = {
  // Backgrounds — deep navy, matching the GridClan emblem
  bg:          '#07172e',   // App background — deep navy
  surface:     '#0e2440',   // Cards / sheets
  surfaceHigh: '#173458',   // Elevated surfaces
  border:      '#214568',   // Dividers, input borders

  // Brand — teal primary, gold secondary (from the emblem)
  primary:     '#2bbf9a',   // GridClan teal
  primaryDim:  '#1f9a7d',   // Pressed state
  accent:      '#e8c45a',   // Gold — score / win / highlight
  accentDim:   '#c9a23f',

  // Game type colours
  wordSearch:  '#7c6dff',   // Violet — Word Search

  // Text
  textPrimary:   '#ffffff',
  textSecondary: '#a8c2dc',
  textMuted:     '#5d7894',

  // Status
  error:   '#ff5a5a',
  warning: '#e8c45a',
  success: '#37d9a3',
  info:    '#44ccff',

  // Points / currency
  points:  '#e8c45a',
  ugx:     '#37d9a3',
  kes:     '#44ccff',
  tzs:     '#ff9944',

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

  primary:     '#1aa183',
  primaryDim:  '#15866d',
  accent:      '#bd962f',
  accentDim:   '#9c7d28',

  wordSearch:  '#5a4ad1',

  textPrimary:   '#0c2138',
  textSecondary: '#3d5a78',
  textMuted:     '#6c829a',

  error:   '#d6453f',
  warning: '#b98421',
  success: '#1f9d74',
  info:    '#1f93cf',

  points:  '#bd962f',
  ugx:     '#1f9d74',
  kes:     '#1f93cf',
  tzs:     '#cf7a2f',

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
  size: {
    xs:   11,
    sm:   13,
    md:   15,
    lg:   18,
    xl:   22,
    xxl:  28,
    hero: 40,
  },
  weight: {
    regular: '400' as const,
    medium:  '500' as const,
    semi:    '600' as const,
    bold:    '700' as const,
    black:   '900' as const,
  },
  family: {
    sans:  Platform.OS === 'ios' ? 'System' : 'Roboto',
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
  SCRABBLE:   { label: 'Grid Scrabble',    icon: '🔤', route: 'scrabble',   color: '#19c37d' },
  GOMOKU:     { label: 'Grid Connect',     icon: '⚫', route: 'gomoku',     color: '#6c8cff' },
  BATTLESHIP: { label: 'Grid Battleships', icon: '🚢', route: 'battleship', color: '#f5a623' },
} as const;
