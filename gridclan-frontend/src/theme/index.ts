import { Platform } from 'react-native';

// ── Palette ────────────────────────────────────────────────────────────────
export const Colors = {
  // Backgrounds
  bg:          '#0f0f1a',   // App background — deep space
  surface:     '#1a1a2e',   // Cards / sheets
  surfaceHigh: '#242440',   // Elevated surfaces
  border:      '#2a2a4a',   // Dividers, input borders

  // Brand
  primary:     '#7c6dff',   // GridClan violet
  primaryDim:  '#5a4dcc',   // Pressed state
  accent:      '#4cff91',   // Success / score / win
  accentDim:   '#2dcc6a',

  // Game type colours
  gridLockdown: '#ff6b6b',  // Red — Grid Lockdown
  sumCipher:    '#ffcc44',  // Gold — Sum Cipher
  linkedRush:   '#44ccff',  // Cyan — Linked Rush

  // Text
  textPrimary:   '#ffffff',
  textSecondary: '#a0a0c0',
  textMuted:     '#505070',

  // Status
  error:   '#ff4d4d',
  warning: '#ffcc44',
  success: '#4cff91',
  info:    '#44ccff',

  // Points / currency
  points:  '#ffd700',
  ugx:     '#4cff91',
  kes:     '#44ccff',
  tzs:     '#ff9944',

  // Overlay
  overlay:     'rgba(0,0,0,0.6)',
  overlayLight: 'rgba(0,0,0,0.3)',
} as const;

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
  GRID_LOCKDOWN: {
    label:       'Grid Lockdown',
    color:       Colors.gridLockdown,
    description: 'Drag tiles to match the target pattern',
    icon:        'grid',
  },
  SUM_CIPHER: {
    label:       'Sum Cipher',
    color:       Colors.sumCipher,
    description: 'Fill cells so every group sums correctly',
    icon:        'hash',
  },
  LINKED_RUSH: {
    label:       'Linked Rush',
    color:       Colors.linkedRush,
    description: 'Chain all nodes without revisiting',
    icon:        'git-branch',
  },
} as const;
