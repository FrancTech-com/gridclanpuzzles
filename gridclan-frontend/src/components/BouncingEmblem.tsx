import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ImageStyle, Platform, StyleProp } from 'react-native';

/**
 * The GridClan shield emblem, gently bouncing on a loop. Used as a hero on the
 * games screen so the brand mark is present once the app is open.
 */
export function BouncingEmblem({ size = 80, style }: {
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, {
          toValue: -14, duration: 650,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(y, {
          toValue: 0, duration: 750,
          easing: Easing.bounce,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y]);

  return (
    <Animated.Image
      source={require('../../assets/images/emblem.png')}
      resizeMode="contain"
      style={[{ width: size, height: size, transform: [{ translateY: y }] }, style]}
    />
  );
}
