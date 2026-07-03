import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@theme/theme';

/**
 * The app-wide backdrop, rendered once at the root under every screen.
 *
 * Light ("sky glass", the default): a sky gradient — azure at the top fading
 * to a sunlit near-white horizon — with a soft sun glow and drifting
 * translucent cloud blobs. Screens paint `bg: transparent`, so this shows
 * through everywhere and the glass surfaces frost over it.
 *
 * Dark: a deep-navy night gradient, keeping the classic dark look intact.
 *
 * Decor is pointerEvents="none" and absolutely positioned; it can never
 * intercept touches or affect layout.
 */
export function SkyBackground({ children }: { children: React.ReactNode }) {
  const { scheme } = useTheme();
  const sky = scheme === 'light';

  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={sky
          ? ['#6db3e8', '#9fd0f2', '#cfe9fb', '#eef8ff']   // azure → sunlit horizon
          : ['#081831', '#0a1b38', '#0d2244']}             // deep navy night
        style={StyleSheet.absoluteFill}
      />
      {sky && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Sun glow, top-left */}
          <View style={[styles.blob, styles.sun]} />
          {/* Cloud blobs — big soft translucent whites */}
          <View style={[styles.blob, styles.cloud1]} />
          <View style={[styles.blob, styles.cloud2]} />
          <View style={[styles.blob, styles.cloud3]} />
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  blob: { position: 'absolute', borderRadius: 9999 },
  sun: {
    top: -90, left: -70, width: 300, height: 300,
    backgroundColor: 'rgba(255,250,220,0.30)',
  },
  cloud1: {
    top: '12%', right: '-8%', width: 320, height: 130,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  cloud2: {
    top: '38%', left: '-6%', width: 260, height: 110,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  cloud3: {
    bottom: '8%', right: '10%', width: 380, height: 150,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
});

export default SkyBackground;
