import React, { useEffect, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { Font } from '@theme/index';
import { useColors } from '@theme/theme';
/**
 * Covers sensitive content while the app is backgrounded so balances and
 * profile details never appear in the OS app-switcher snapshot
 * (blueprint § SECURITY — FRONTEND: blur sensitive screens on app background).
 *
 * An opaque cover rather than a blur: RN takes the switcher snapshot from
 * the last rendered frame, so the cover must fully hide the content — and
 * it needs no native blur dependency.
 *
 * Usage: wrap the screen's top-level element.
 *   <PrivacyShield><ScrollView>…</ScrollView></PrivacyShield>
 */
export function PrivacyShield({ children }: { children: React.ReactNode }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => setHidden(state !== 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.fill}>
      {children}
      {hidden && (
        <View style={styles.cover}>
          <Text style={styles.logo}>GridClan Puzzles</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  fill: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: Colors.bg,
    justifyContent: 'center',
  },
  logo: {
    color: Colors.textPrimary,
    fontSize: Font.size.xl,
    fontWeight: 'bold',
  },
});
