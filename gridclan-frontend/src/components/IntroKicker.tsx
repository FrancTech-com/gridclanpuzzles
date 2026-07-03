import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Font } from '@theme/index';
import { useColors, useTheme } from '@theme/theme';

/**
 * Opening cartoon: a little round buddy stands under the title and KICKS the
 * letters of "GridClan" up into place, one per kick. When the last letter
 * lands he breaks into a big smile, does a happy hop, "Puzzles" fades in,
 * and the whole thing melts away into the app. Tap anywhere to skip.
 *
 * Plays once per app launch (module flag) — hot reloads and tab navigation
 * never replay it. Pure RN Animated + Views, so it runs identically on web.
 */

const WORD = 'GridClan';
const KICK_EVERY = 260;   // ms between kicks — one letter per kick
const FLIGHT = 480;       // ms a letter is airborne

let played = false;
export function introAlreadyPlayed() { return played; }

export function IntroKicker({ onDone }: { onDone: () => void }) {
  const Colors = useColors();
  const { scheme } = useTheme();
  const quartet = [Colors.green, Colors.blue, Colors.yellow, Colors.red];

  const [smiling, setSmiling] = useState(false);
  const doneRef = useRef(false);
  const mountedRef = useRef(true);

  const letterVals = useRef(WORD.split('').map(() => new Animated.Value(0))).current;
  const kick   = useRef(new Animated.Value(0)).current;  // -1 wind-up · 0 rest · 1 kick
  const jump   = useRef(new Animated.Value(0)).current;  // happy hop after the smile
  const subOp  = useRef(new Animated.Value(0)).current;  // "Puzzles" subtitle
  const fade   = useRef(new Animated.Value(1)).current;  // whole-overlay fade-out

  const native = Platform.OS !== 'web';

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  useEffect(() => {
    played = true;

    // One kick cycle per letter: wind-up → kick → back to standing.
    const kicks = Animated.sequence(WORD.split('').map(() => Animated.sequence([
      Animated.timing(kick, { toValue: -1, duration: 90,  easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(kick, { toValue: 1,  duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(kick, { toValue: 0,  duration: KICK_EVERY - 200, useNativeDriver: native }),
    ])));

    // Each letter launches just as its kick connects.
    const flights = letterVals.map((v, i) => Animated.sequence([
      Animated.delay(i * KICK_EVERY + 120),
      Animated.timing(v, { toValue: 1, duration: FLIGHT, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
    ]));

    Animated.parallel([kicks, ...flights]).start(({ finished }) => {
      if (!finished || doneRef.current) return;
      if (mountedRef.current) setSmiling(true);
      Animated.parallel([
        Animated.timing(subOp, { toValue: 1, duration: 350, useNativeDriver: native }),
        Animated.sequence([
          Animated.timing(jump, { toValue: -18, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(jump, { toValue: 0,   duration: 220, easing: Easing.bounce,           useNativeDriver: native }),
          Animated.timing(jump, { toValue: -10, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(jump, { toValue: 0,   duration: 180, easing: Easing.bounce,           useNativeDriver: native }),
        ]),
      ]).start(() => {
        Animated.sequence([
          Animated.delay(650),   // let the smile land
          Animated.timing(fade, { toValue: 0, duration: 420, useNativeDriver: native }),
        ]).start(finish);
      });
    });

    return () => { mountedRef.current = false; };
  }, []);

  // Buddy pose driven by the kick value.
  const legAngle = kick.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-30deg', '0deg', '55deg'] });
  const bodyTilt = kick.interpolate({ inputRange: [-1, 0, 1], outputRange: ['6deg', '0deg', '-10deg'] });
  const bodyHop  = kick.interpolate({ inputRange: [-1, 0, 1], outputRange: [2, 0, -7] });

  const mid = (WORD.length - 1) / 2;

  return (
    <Pressable style={styles.overlay} onPress={finish} accessibilityLabel="Skip intro">
      <Animated.View style={[styles.fill, { opacity: fade }]}>
        {/* Same sky/night stops as SkyBackground, so skipping is seamless */}
        <LinearGradient
          colors={scheme === 'light'
            ? ['#6db3e8', '#9fd0f2', '#cfe9fb', '#eef8ff']
            : ['#081831', '#0a1b38', '#0d2244']}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.center}>
          {/* The word being kicked together */}
          <View style={styles.wordRow}>
            {WORD.split('').map((ch, i) => {
              const v = letterVals[i];
              return (
                <Animated.Text
                  key={i}
                  style={[styles.letter, {
                    color: quartet[i % 4],
                    opacity: v.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] }),
                    transform: [
                      // from the buddy's boot (below, off-centre) up into the slot
                      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [(mid - i) * 30, 0] }) },
                      { translateY: v.interpolate({ inputRange: [0, 0.55, 1], outputRange: [150, -26, 0] }) },
                      { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? '-200deg' : '160deg', '0deg'] }) },
                    ],
                  }]}
                >
                  {ch}
                </Animated.Text>
              );
            })}
          </View>

          <Animated.Text style={[styles.subtitle, { color: Colors.textSecondary, opacity: subOp }]}>
            Puzzles
          </Animated.Text>

          {/* The buddy */}
          <Animated.View style={[styles.buddy, { transform: [{ translateY: Animated.add(jump, bodyHop) }, { rotate: bodyTilt }] }]}>
            <View style={styles.body}>
              {/* Eyes: round & focused while kicking, happy arcs once done */}
              <View style={styles.eyeRow}>
                {smiling ? (<><View style={styles.happyEye} /><View style={styles.happyEye} /></>)
                  : (<>
                      <View style={styles.eye}><View style={styles.pupil} /></View>
                      <View style={styles.eye}><View style={styles.pupil} /></View>
                    </>)}
              </View>
              {smiling && (
                <View style={styles.cheekRow}>
                  <View style={styles.cheek} /><View style={styles.cheek} />
                </View>
              )}
              {smiling ? <View style={styles.smile} /> : <View style={styles.mouth} />}
            </View>
            <View style={styles.legRow}>
              <View style={styles.leg}><View style={styles.shoe} /></View>
              <Animated.View style={[styles.leg, styles.kickLeg, { transform: [{ rotate: legAngle }] }]}>
                <View style={styles.shoe} />
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        <Text style={[styles.skipHint, { color: Colors.textMuted }]}>tap to skip</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  fill:    { flex: 1 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  wordRow: { flexDirection: 'row' },
  letter:  { fontFamily: Font.family.displayBold, fontSize: 46, lineHeight: 56 },
  subtitle:{ fontFamily: Font.family.displaySemi, fontSize: 22, marginTop: 2 },

  buddy: { marginTop: 40, alignItems: 'center', width: 120 },
  body: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: '#ffd34d', borderWidth: 3, borderColor: '#e8a900',
    alignItems: 'center',
  },
  eyeRow:  { flexDirection: 'row', gap: 12, marginTop: 22 },
  eye:     { width: 17, height: 17, borderRadius: 9, backgroundColor: '#fff', borderWidth: 2, borderColor: '#3a2b00', alignItems: 'center', justifyContent: 'center' },
  pupil:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3a2b00' },
  happyEye:{ width: 18, height: 9, borderTopWidth: 3.5, borderColor: '#3a2b00', borderTopLeftRadius: 9, borderTopRightRadius: 9, marginTop: 5 },
  cheekRow:{ flexDirection: 'row', gap: 42, position: 'absolute', top: 40 },
  cheek:   { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,120,120,0.65)' },
  mouth:   { width: 13, height: 4, borderRadius: 2, backgroundColor: '#7a4a00', marginTop: 12 },
  smile:   { width: 32, height: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: '#7a3a00', marginTop: 8 },

  legRow:  { flexDirection: 'row', gap: 14, marginTop: -4 },
  leg:     { width: 9, height: 24, borderRadius: 5, backgroundColor: '#e8a900', alignItems: 'center' },
  kickLeg: {},
  shoe:    { position: 'absolute', bottom: -4, width: 20, height: 10, borderRadius: 5, backgroundColor: '#37455b' },

  skipHint: { position: 'absolute', bottom: 28, alignSelf: 'center', fontSize: 12 },
});

export default IntroKicker;
