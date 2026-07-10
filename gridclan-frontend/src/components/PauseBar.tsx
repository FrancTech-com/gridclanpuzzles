import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * Pause / resume control for a live game (or tournament). When paused it shows a
 * prominent banner with a Resume button; otherwise a small "Pause" pill. The
 * caller wires the actual pause()/resume() API calls.
 */
export function PauseBar({
  paused, onPause, onResume, busy, width,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  busy?: boolean;
  width?: number;
}) {
  const Colors = useColors();
  const { t } = useTranslation();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);

  if (paused) {
    return (
      <View style={[styles.banner, width ? { width } : null]}>
        <Text style={styles.bannerText}>⏸ {t('pause.pausedBanner', 'Paused')}</Text>
        <TouchableOpacity style={styles.resumeBtn} onPress={onResume} disabled={busy}>
          <Text style={styles.resumeText}>▶ {t('pause.resume', 'Resume')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.pill} onPress={onPause} disabled={busy}>
      <Text style={styles.pillText}>⏸ {t('pause.pause', 'Pause')}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.accent + '22', borderColor: Colors.accent, borderWidth: 1,
    borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm, alignSelf: 'center', gap: Spacing.md,
  },
  bannerText: { color: Colors.accent, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  resumeBtn: { backgroundColor: Colors.accent, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  resumeText: { color: Colors.textOnBrand, fontWeight: Font.weight.bold, fontSize: Font.size.sm },

  pill: { alignSelf: 'center', borderColor: Colors.border, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, marginBottom: Spacing.xs },
  pillText: { color: Colors.textMuted, fontSize: Font.size.xs, fontWeight: Font.weight.semi },
});
