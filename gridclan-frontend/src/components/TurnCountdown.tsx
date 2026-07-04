import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * The 5-minute turn clock, ticking down to the server's `turnDeadline`.
 * Shown in every PvP game (friend + tournament — never solo). Turns amber
 * under a minute and red under 15 seconds; at zero the server auto-passes
 * the turn (Chess: loss on time), so the next poll flips the board anyway.
 */
export function TurnCountdown({ deadline }: { deadline: number | null | undefined }) {
  const Colors = useColors();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (!deadline) return null;
  const left = Math.max(0, Math.floor((deadline - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const color = left <= 15 ? Colors.error : left <= 60 ? Colors.accent : Colors.textSecondary;

  return (
    <View style={[styles.chip, { borderColor: color, backgroundColor: Colors.surfaceHigh }]}>
      <Text style={[styles.text, { color }]}>
        ⏱ {mm}:{ss}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    marginBottom: Spacing.xs,
  },
  text: { fontSize: Font.size.sm, fontWeight: Font.weight.bold, fontVariant: ['tabular-nums'] },
});
