import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type ThemeColors } from './index';

export type ThemePref = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'theme_pref';

interface ThemeContextValue {
  pref:    ThemePref;          // what the user chose
  scheme:  'light' | 'dark';   // resolved (system → actual)
  colors:  ThemeColors;        // active palette
  setPref: (p: ThemePref) => void;
}

// Default = light ("sky glass"), the game's signature look from first open.
// A saved preference (including dark) still wins once loaded.
const ThemeContext = createContext<ThemeContextValue>({
  pref: 'light', scheme: 'light', colors: lightColors, setPref: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();               // 'light' | 'dark' | null
  const [pref, setPrefState] = useState<ThemePref>('light');

  // Load saved preference once.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v); })
      .catch(() => {});
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  };

  const scheme: 'light' | 'dark' =
    pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  const colors = scheme === 'light' ? lightColors : darkColors;

  const value = useMemo(
    () => ({ pref, scheme, colors, setPref }),
    [pref, scheme, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Active palette for the current theme. */
export const useColors = (): ThemeColors => useContext(ThemeContext).colors;

/** Full theme controls (preference, resolved scheme, setter). */
export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
