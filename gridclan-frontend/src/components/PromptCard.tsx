import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * A small animated popup card with a title, message, and two actions
 * (accept / decline). Used for revive prompts and the out-of-gems → buy-gems
 * prompt, replacing red error text and the (web-broken) Alert dialogs.
 */
export function PromptCard({
  visible, emoji, title, message, acceptLabel, declineLabel, onAccept, onDecline, busy,
}: {
  visible: boolean;
  emoji?: string;
  title: string;
  message?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const pop  = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      pop.setValue(0); fade.setValue(0);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onDecline}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={busy ? undefined : onDecline} />
        <Animated.View
          style={[styles.card, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}
        >
          {!!emoji && <Text style={styles.emoji}>{emoji}</Text>}
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <TouchableOpacity style={[styles.accept, busy && styles.disabled]} onPress={onAccept} disabled={busy} activeOpacity={0.85}>
            <Text style={styles.acceptText}>{acceptLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.decline} onPress={onDecline} disabled={busy} activeOpacity={0.7}>
            <Text style={styles.declineText}>{declineLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000aa', padding: Spacing.xl },
  card: {
    width: '100%', maxWidth: 340, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.md,
  },
  emoji:   { fontSize: 52, marginBottom: Spacing.sm },
  title:   { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.bold, textAlign: 'center' },
  message: { color: Colors.textSecondary, fontSize: Font.size.md, textAlign: 'center', marginTop: Spacing.xs, marginBottom: Spacing.lg, lineHeight: 22 },
  accept:  { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, minWidth: 200, alignItems: 'center' },
  acceptText: { color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.md },
  disabled: { opacity: 0.6 },
  decline: { paddingVertical: Spacing.sm, marginTop: Spacing.xs, minWidth: 200, alignItems: 'center' },
  declineText: { color: Colors.textMuted, fontWeight: Font.weight.semi, fontSize: Font.size.md },
});
