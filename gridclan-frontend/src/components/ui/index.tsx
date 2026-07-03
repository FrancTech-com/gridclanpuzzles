import React, { useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput,
  TextInputProps, TouchableOpacity, TouchableOpacityProps, View, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Font, Glass, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
// ── Button ─────────────────────────────────────────────────────────────────
interface ButtonProps extends TouchableOpacityProps {
  title:    string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?:    'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ title, variant = 'primary', size = 'md', loading, style, disabled, ...props }: ButtonProps) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const bg = {
    primary:   Colors.primary,
    secondary: Colors.surfaceHigh,
    ghost:     'transparent',
    danger:    Colors.error,
  }[variant];

  const textColor = variant === 'ghost' ? Colors.primary : Colors.textPrimary;
  const pad = { sm: Spacing.sm, md: Spacing.md, lg: Spacing.lg }[size];
  const fontSize = { sm: Font.size.sm, md: Font.size.md, lg: Font.size.lg }[size];

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        { backgroundColor: bg, paddingVertical: pad, paddingHorizontal: pad * 1.5 },
        variant === 'ghost' && styles.btnGhost,
        (disabled || loading) && styles.btnDisabled,
        style as ViewStyle,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.75}
      {...props}
    >
      {loading
        ? <ActivityIndicator size="small" color={textColor} />
        : <Text style={[styles.btnText, { color: textColor, fontSize }]}>{title}</Text>
      }
    </TouchableOpacity>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; style?: ViewStyle; }

export function Card({ children, style }: CardProps) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Input ──────────────────────────────────────────────────────────────────
interface InputProps extends TextInputProps {
  label?:  string;
  error?:  string;
}

export function Input({ label, error, style, secureTextEntry, ...props }: InputProps) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const isPassword = !!secureTextEntry;
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.inputWrapper}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, isPassword && styles.inputWithIcon, error ? styles.inputError : null, style as any]}
          placeholderTextColor={Colors.textMuted}
          selectionColor={Colors.primary}
          secureTextEntry={isPassword ? hidden : secureTextEntry}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setHidden(h => !h)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.inputErrorText}>{error}</Text>}
    </View>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: string; }

export function Badge({ label, color }: BadgeProps) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const c = color ?? Colors.primary;
  return (
    <View style={[styles.badge, { backgroundColor: c + '28' }]}>
      <Text style={[styles.badgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

// ── PointsBadge ────────────────────────────────────────────────────────────
export function PointsBadge({ points }: { points: number }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.pointsBadge}>
      <Text style={styles.pointsIcon}>⬡</Text>
      <Text style={styles.pointsText}>{points.toLocaleString()}</Text>
    </View>
  );
}

// ── Loading spinner ────────────────────────────────────────────────────────
export function LoadingSpinner({ size = 'large', color }: { size?: 'small' | 'large'; color?: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.spinner}>
      <ActivityIndicator size={size} color={color ?? Colors.primary} />
    </View>
  );
}

// ── Separator ─────────────────────────────────────────────────────────────
export function Separator() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return <View style={styles.separator} />;
}

// ── Empty state ────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  btn: {
    borderRadius:    Radius.md,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
    ...Shadow.sm,
  },
  btnGhost:    { borderWidth: 1, borderColor: Colors.primary },
  btnDisabled: { opacity: 0.5 },
  btnText:     { fontFamily: Font.family.displaySemi, letterSpacing: 0.3 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    padding:         Spacing.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    ...Shadow.sm,
    ...Glass,
  },

  inputWrapper: { marginBottom: Spacing.md },
  inputLabel: {
    color:         Colors.textSecondary,
    fontSize:      Font.size.sm,
    marginBottom:  Spacing.xs,
    fontWeight:    Font.weight.medium,
  },
  input: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius:    Radius.md,
    paddingVertical:   Spacing.md,
    paddingHorizontal: Spacing.md,
    color:           Colors.textPrimary,
    fontSize:        Font.size.md,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  inputRow:       { position: 'relative', justifyContent: 'center' },
  inputWithIcon:  { paddingRight: Spacing.xl + Spacing.md },
  eyeBtn:         { position: 'absolute', right: Spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  inputError:     { borderColor: Colors.error },
  inputErrorText: { color: Colors.error, fontSize: Font.size.xs, marginTop: 4 },

  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.xs - 2,
    borderRadius:      Radius.full,
    alignSelf:         'flex-start',
  },
  badgeText: { fontSize: Font.size.xs, fontWeight: Font.weight.semi },

  pointsBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: Colors.points + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.xs,
    borderRadius:   Radius.full,
    gap: 4,
  },
  pointsIcon: { color: Colors.points, fontSize: Font.size.md },
  pointsText: { color: Colors.points, fontFamily: Font.family.displayBold, fontSize: Font.size.md },

  spinner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },

  separator: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },

  emptyState: { alignItems: 'center', padding: Spacing.xxl, gap: Spacing.sm },
  emptyIcon:     { fontSize: 48 },
  emptyTitle:    { color: Colors.textPrimary, fontSize: Font.size.lg, fontFamily: Font.family.displaySemi },
  emptySubtitle: { color: Colors.textMuted,   fontSize: Font.size.md, textAlign: 'center' },
});
