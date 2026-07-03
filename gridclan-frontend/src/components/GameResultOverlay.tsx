import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator, Animated, Easing, Modal, StyleSheet, Text,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

export type GameOutcome = 'WON' | 'LOST' | 'TIE';
/** Solo (Word Search) grade by points earned: ≥900 exceptional, ≥750 good, else lower. */
export type SoloTier = 'EXCEPTIONAL' | 'GOOD' | 'LOWER';
export interface SoloResult { tier: SoloTier; score: number; moves?: number }

/**
 * Big animated result popup.
 *  • PvP (`outcome`): celebratory burst on a win, gentle card on a loss, neutral tie.
 *  • Solo (`solo`):   a graded "Exceptional / Well done / Completed" card that shows
 *    the points earned — for the Word Search puzzle.
 * Tap the backdrop or the button to dismiss.
 */
export function GameResultOverlay({
  visible, outcome, solo, onClose, onNext, nextBusy,
}: {
  visible: boolean;
  outcome?: GameOutcome | null;
  solo?: SoloResult | null;
  onClose: () => void;
  /** Ladder win → jump straight into the just-unlocked level (primary button);
   *  Continue demotes to a quiet secondary. */
  onNext?: (() => void) | null;
  nextBusy?: boolean;
}) {
  const Colors = useColors();
  const { width, height } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const pop  = useRef(new Animated.Value(0)).current;  // card scale/opacity
  const fade = useRef(new Animated.Value(0)).current;  // backdrop opacity

  const active = !!outcome || !!solo;

  useEffect(() => {
    if (visible && active) {
      pop.setValue(0); fade.setValue(0);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, outcome, solo?.tier]);

  if (!visible || !active) return null;

  // Resolve the card content for whichever mode we're in.
  let bigEmoji: string, title: string, subtitle: string, titleColor: string, confetti: boolean;

  if (solo) {
    const earned = t('result.earned', { score: solo.score.toLocaleString(), defaultValue: 'You earned {{score}} pts' });
    if (solo.tier === 'EXCEPTIONAL') {
      bigEmoji = '🌟'; confetti = true; titleColor = Colors.accent;
      title = t('result.exceptional', 'Exceptional!');
      subtitle = t('result.exceptionalSub', { score: solo.score.toLocaleString(), defaultValue: 'A near-perfect solve — {{score}} pts! 🏆' });
    } else if (solo.tier === 'GOOD') {
      bigEmoji = '🎉'; confetti = true; titleColor = Colors.primary;
      title = t('result.good', 'Well done!');
      subtitle = earned;
    } else {
      bigEmoji = '✅'; confetti = false; titleColor = Colors.textPrimary;
      title = t('result.completed', 'Puzzle complete');
      subtitle = `${earned} · ${t('result.tryFewerMoves', 'fewer moves = more points')}`;
    }
  } else {
    const isWin = outcome === 'WON';
    confetti   = isWin;
    bigEmoji   = isWin ? '🎉' : outcome === 'LOST' ? '😢' : '🤝';
    titleColor = isWin ? Colors.accent : outcome === 'LOST' ? '#e06a5a' : Colors.textPrimary;
    title = isWin
      ? t('result.won', 'You won!')
      : outcome === 'LOST' ? t('result.lost', 'You lost') : t('result.tie', "It's a tie");
    subtitle = isWin
      ? t('result.wonSub', 'Great play — well deserved! 🏆')
      : outcome === 'LOST' ? t('result.lostSub', 'So close — go again?') : t('result.tieSub', 'Evenly matched!');
  }

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        {/* Tap anywhere to dismiss */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        {confetti && <Confetti width={width} height={height} />}

        <Animated.View
          style={[
            styles.card,
            { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}
          pointerEvents="box-none"
        >
          <Text style={styles.emoji}>{bigEmoji}</Text>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {solo && (
            <View style={styles.scorePill}>
              <Text style={styles.scorePillValue}>{solo.score.toLocaleString()}</Text>
              <Text style={styles.scorePillLabel}>{t('common.pts', 'pts')}</Text>
            </View>
          )}
          {onNext ? (
            <>
              <TouchableOpacity style={styles.btn} onPress={onNext} disabled={nextBusy} activeOpacity={0.85}>
                {nextBusy
                  ? <ActivityIndicator color={Colors.textPrimary} />
                  : <Text style={styles.btnText}>{t('result.nextLevel', 'Next level ▶')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={nextBusy} activeOpacity={0.85}>
                <Text style={styles.btnGhostText}>{t('result.continue', 'Continue')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.btn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.btnText}>{t('result.continue', 'Continue')}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── Confetti burst (emoji, no extra deps) ─────────────────────────────────────

const CONFETTI = ['🎉', '🎊', '✨', '⭐', '🏆', '🥳'];

function Confetti({ width, height }: { width: number; height: number }) {
  const pieces = useMemo(
    () => Array.from({ length: 18 }).map((_, i) => ({
      x:      Math.random() * width,
      emoji:  CONFETTI[i % CONFETTI.length],
      delay:  Math.random() * 350,
      size:   22 + Math.random() * 20,
      spin:   Math.random() > 0.5 ? 1 : -1,
      drift:  (Math.random() - 0.5) * 80,
    })),
    [width],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => <ConfettiPiece key={i} {...p} height={height} />)}
    </View>
  );
}

function ConfettiPiece({
  x, emoji, delay, size, spin, drift, height,
}: { x: number; emoji: string; delay: number; size: number; spin: number; drift: number; height: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1, duration: 1600 + Math.random() * 900, delay,
      easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start();
  }, []);
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [-40, height * 0.85] });
  const translateX = a.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  const rotate     = a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin * 360}deg`] });
  const opacity    = a.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.Text
      style={{ position: 'absolute', left: x, top: 0, fontSize: size, opacity, transform: [{ translateY }, { translateX }, { rotate }] }}
    >
      {emoji}
    </Animated.Text>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000aa', padding: Spacing.xl },
  card: {
    width: '100%', maxWidth: 360, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.md,
  },
  emoji:    { fontSize: 88, marginBottom: Spacing.sm },
  title:    { fontSize: Font.size.xxl, fontWeight: Font.weight.black, textAlign: 'center' },
  subtitle: { color: Colors.textSecondary, fontSize: Font.size.md, textAlign: 'center', marginTop: Spacing.xs, marginBottom: Spacing.lg },
  scorePill:      { flexDirection: 'row', alignItems: 'baseline', gap: 6, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, marginBottom: Spacing.lg },
  scorePillValue: { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black },
  scorePillLabel: { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  btn:      { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, minWidth: 160, alignItems: 'center' },
  btnText:  { color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.md },
  btnGhost:     { marginTop: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xs, minWidth: 160, alignItems: 'center' },
  btnGhostText: { color: Colors.textMuted, fontWeight: Font.weight.semi, fontSize: Font.size.sm },
});
