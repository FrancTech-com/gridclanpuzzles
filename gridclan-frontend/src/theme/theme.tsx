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

const ThemeContext = createContext<ThemeContextValue>({
  pref: 'dark', scheme: 'dark', colors: darkColors, setPref: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();               // 'light' | 'dark' | null
  const [pref, setPrefState] = useState<ThemePref>('dark');

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
