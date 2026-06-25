import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@theme/theme';
/**
 * Web layout frame.
 *
 * On web the app is a mobile-first design, so on large desktop monitors we
 * centre it in a phone-width column (max 480px) over a darker backdrop —
 * a "phone frame" look. The column itself uses width:100% so it collapses
 * gracefully down to small phone widths (320px) with no fixed sizing, and it
 * re-flows automatically on window resize (flexbox, no JS resize handling
 * needed).
 *
 * On native (iOS/Android) it is a no-op pass-through, so mobile builds are
 * completely unaffected.
 */
export function WebContainer({ children }: { children: React.ReactNode }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <View style={styles.backdrop}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  // Fills the viewport behind the app column.
  backdrop: {
    flex: 1,
    backgroundColor: '#07070d', // darker than app bg, so the column reads as a frame
    alignItems: 'center',
  },
  // The app itself — phone-width on desktop, full-width on small screens.
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.bg,
    // Subtle side edges visible only when the backdrop shows (desktop).
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
});

export default WebContainer;
