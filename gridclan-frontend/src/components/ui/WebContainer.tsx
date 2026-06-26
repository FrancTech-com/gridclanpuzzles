import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@theme/theme';
/**
 * Web layout frame.
 *
 * On web we centre the app in a comfortable content column over a darker
 * full-bleed backdrop, so it reads as a real desktop app rather than a stretched
 * phone. The column is wide enough to feel like desktop (up to 1100px) but
 * capped so single elements (forms, the play button, a lone card) don't blow out
 * to the full width of a large monitor and look broken. Screens that show
 * lists/cards reflow into multiple columns at this width (flexWrap), so the
 * space is genuinely used; single-column content stays centred and readable.
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
  // The app itself — a comfortable content column on desktop, full-width on phones.
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 1100,
    backgroundColor: Colors.bg,
    // Subtle side edges visible only when the backdrop shows (desktop).
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
});

export default WebContainer;
