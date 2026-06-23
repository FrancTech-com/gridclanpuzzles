/**
 * i18n bootstrap (blueprint § Frontend: react-i18next + expo-localization;
 * English default, Swahili, French, Portuguese, Hindi, Tagalog).
 *
 * Adding a language without an app rebuild:
 *   1. Ship the new JSON via EAS Update (OTA) and list it below, or
 *   2. Fetch a bundle at runtime and call
 *      i18n.addResourceBundle(lng, 'translation', bundle) — i18next picks
 *      it up immediately; no store submission needed.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
// Language preference is not a secret — AsyncStorage is fine here
// (expo-secure-store is reserved for tokens, per blueprint § SECURITY).
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import sw from './locales/sw.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import hi from './locales/hi.json';
import tl from './locales/tl.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'tl', label: 'Tagalog' },
] as const;

const resources = {
  en: { translation: en },
  sw: { translation: sw },
  fr: { translation: fr },
  pt: { translation: pt },
  hi: { translation: hi },
  tl: { translation: tl },
};

/** Best-supported language for the device, falling back to English. */
function detectDeviceLanguage(): string {
  for (const locale of getLocales()) {
    const code = locale.languageCode;
    // expo-localization reports Filipino as "fil"; our bundle key is "tl"
    const normalized = code === 'fil' ? 'tl' : code;
    if (normalized && normalized in resources) return normalized;
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React Native already escapes rendered text
  },
  returnNull: false,
});

const LANGUAGE_STORAGE_KEY = 'gridclan.language';

/** Settings → Language: switches immediately and persists the choice. */
export function changeLanguage(code: string): Promise<unknown> {
  AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code).catch(() => {});
  return i18n.changeLanguage(code);
}

/**
 * Re-applies a previously chosen language. Called once at app start
 * (init above is synchronous and uses the device locale; this overrides
 * it as soon as the stored choice loads).
 */
export async function loadPersistedLanguage(): Promise<void> {
  try {
    const code = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (code && code in resources && code !== i18n.language) {
      await i18n.changeLanguage(code);
    }
  } catch {
    // device locale stays in effect
  }
}

export default i18n;
