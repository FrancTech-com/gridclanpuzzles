import { Platform } from 'react-native';

// ── Palette ────────────────────────────────────────────────────────────────
export const Colors = {
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
  gridLockdown: '#ff6b6b',  // Red — Grid Lockdown
  sumCipher:    '#e8c45a',  // Gold — Sum Cipher
  linkedRush:   '#44ccff',  // Cyan — Linked Rush

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
