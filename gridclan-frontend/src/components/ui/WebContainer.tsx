import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Web layout frame.
 *
 * FULL-BLEED desktop: the SkyBackground gradient (rendered above this in the
 * root layout) fills the entire browser window, so the app reads as a real
 * full-screen web game, not a phone column floating in a dark frame. Content
 * itself is kept to a wide, readable band (up to 1500px, centred) — because
 * the frame and background are gone, this no longer looks like "a box in the
 * middle": screens' multi-column layouts (flexWrap) genuinely use the width,
 * and the sky flows edge to edge behind everything.
 *
 * On native (iOS/Android) it is a no-op pass-through.
 */
export function WebContainer({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={styles.viewport}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent: the SkyBackground behind it owns the whole window.
  viewport: { flex: 1, alignItems: 'center' },
  content:  { flex: 1, width: '100%', maxWidth: 1500 },
});

export default WebContainer;
