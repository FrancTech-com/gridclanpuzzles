import React, { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemePref } from '@theme/theme';
import { isMuted, setMuted, playSfx } from '@services/sound';

/**
 * Global floating quick-controls for the tab pages:
 *   - top-left  → theme (cycles system → light → dark)
 *   - top-right → sound (mute / unmute)
 *
 * Rendered once in (tabs)/_layout over the screens. The container is
 * pointerEvents="box-none" so only the buttons capture taps; the rest of the
 * page stays interactive. Tab screens start their content ~56px down, so these
 * sit clear in the corners.
 */
const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark'];

export function FloatingControls() {
  const { pref, scheme, colors, setPref } = useTheme();
  const insets = useSafeAreaInsets();
  const [muted, setMutedState] = useState(isMuted());

  const top = (Platform.OS === 'web' ? 10 : insets.top + 4);

  const themeIcon =
    pref === 'system' ? 'contrast'
    : pref === 'light' ? 'sunny'
    : 'moon';

  function cycleTheme() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
    setPref(next);
    playSfx('tap');
  }

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playSfx('tap');   // give audible feedback when turning ON
  }

  const btn = [styles.btn, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <TouchableOpacity
        style={btn}
        onPress={cycleTheme}
        accessibilityLabel={`Theme: ${pref}`}
        activeOpacity={0.8}
        hitSlop={8}
      >
        <Ionicons name={themeIcon as any} size={20} color={scheme === 'dark' ? colors.textPrimary : colors.textPrimary} />
      </TouchableOpacity>

      <TouchableOpacity
        style={btn}
        onPress={toggleSound}
        accessibilityLabel={muted ? 'Sound off' : 'Sound on'}
        activeOpacity={0.8}
        hitSlop={8}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={muted ? colors.textMuted : colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between',
    zIndex: 50,
  },
  btn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    // subtle elevation/shadow so it reads as floating chrome
    ...Platform.select({
      web:    { boxShadow: '0 1px 4px rgba(0,0,0,0.3)' } as any,
      default:{ elevation: 3, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    }),
  },
});

export default FloatingControls;
