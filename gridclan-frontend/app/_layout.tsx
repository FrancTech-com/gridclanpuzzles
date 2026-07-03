import React, { useEffect, useRef } from 'react';
import { Platform, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { store, persistor, RootState, AppDispatch } from '@store/index';
import { hydrateAuth } from '@store/slices/authSlice';
import { Font } from '@theme/index';
import { ThemeProvider, useTheme } from '@theme/theme';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { WebContainer } from '@components/ui/WebContainer';
import { SkyBackground } from '@components/ui/SkyBackground';
import { IntroKicker, introAlreadyPlayed } from '@components/IntroKicker';
import { installGlobalErrorHandlers } from '@services/errorReporter';
import { startActivityTracker, stopActivityTracker } from '@services/activityTracker';
import { installDeepLinkValidation, warnIfDeviceRooted } from '@services/deviceSecurity';
import { loadSoundPref } from '@services/sound';
import { loadPersistedLanguage } from '@i18n/index'; // also runs i18next init before first render

SplashScreen.preventAutoHideAsync();

// Make Nunito the app-wide default for any <Text>/<TextInput> that doesn't set
// its own family. Per-instance styles still win, so headings can opt into
// Fredoka. Applied once at module load; screens only render after fonts load.
const defaultFontStyle = { fontFamily: Font.family.body };
const RNTextAny = RNText as unknown as { defaultProps?: { style?: unknown } };
const RNTextInputAny = RNTextInput as unknown as { defaultProps?: { style?: unknown } };
RNTextAny.defaultProps = RNTextAny.defaultProps || {};
RNTextAny.defaultProps.style = [defaultFontStyle, RNTextAny.defaultProps.style];
RNTextInputAny.defaultProps = RNTextInputAny.defaultProps || {};
RNTextInputAny.defaultProps.style = [defaultFontStyle, RNTextInputAny.defaultProps.style];

// Sentry error tracking (blueprint § Observability). No-op until a DSN is
// configured in app config extra. Complements (does not replace) the
// in-house errorReporter, which feeds the backend /ops/error-report.
const SENTRY_DSN = Constants.expoConfig?.extra?.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false, // never PII
    enabled: !__DEV__,
  });
}

// Install global unhandled-error / rejection handlers once at module level
installGlobalErrorHandlers();

// ── Inner layout — runs inside Redux Provider ──────────────────────────────
function RootNavigator() {
  const dispatch = useDispatch<AppDispatch>();
  const userId   = useSelector((s: RootState) => s.auth.userId);
  const prevUserIdRef = useRef<string | null>(null);
  const { scheme, colors } = useTheme();
  // Opening cartoon — once per launch, over the first screen, tap to skip.
  // NATIVE ONLY: web already has the two-act HTML splash (+html.tsx), whose
  // Act 2 features the same buddy kicking the letters in — two intros
  // back-to-back would drag.
  const [showIntro, setShowIntro] = React.useState(
    () => Platform.OS !== 'web' && !introAlreadyPlayed(),
  );

  // Bundled brand fonts — Fredoka (display) + Nunito (body).
  const [fontsLoaded] = useFonts({
    Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold,
    Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
  });
  const hydratedRef = useRef(false);

  useEffect(() => {
    dispatch(hydrateAuth()).finally(() => { hydratedRef.current = true; maybeHideSplash(); });
    loadPersistedLanguage();                    // user's language choice, if any
    loadSoundPref();                            // restore mute preference
    warnIfDeviceRooted();                       // soft warning, never blocks
    return installDeepLinkValidation();
  }, []);

  // Hide the native splash only once auth has hydrated AND fonts are ready, so
  // the first frame the user sees is fully styled (no system-font flash).
  function maybeHideSplash() {
    if (fontsLoaded && hydratedRef.current) SplashScreen.hideAsync().catch(() => {});
  }
  useEffect(() => { maybeHideSplash(); }, [fontsLoaded]);

  // Start/stop activity tracker whenever authentication state changes
  useEffect(() => {
    const wasLoggedIn = prevUserIdRef.current !== null;
    const isLoggedIn  = userId !== null;
    prevUserIdRef.current = userId;

    if (isLoggedIn && !wasLoggedIn) {
      startActivityTracker();
    } else if (!isLoggedIn && wasLoggedIn) {
      stopActivityTracker();
    }

    return () => {
      if (isLoggedIn) stopActivityTracker();
    };
  }, [userId]);

  if (!fontsLoaded) return null;                // splash stays up until fonts ready

  // Navigation theme with a TRANSPARENT background: react-navigation otherwise
  // paints its default grey/black behind every scene, hiding the SkyBackground.
  const navTheme = {
    ...(scheme === 'light' ? DefaultTheme : DarkTheme),
    colors: {
      ...(scheme === 'light' ? DefaultTheme : DarkTheme).colors,
      background: 'transparent',
      card:       'transparent',
      primary:    colors.primary,
    },
  };

  return (
    <ErrorBoundary>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} backgroundColor={colors.bgSolid} />
      <NavThemeProvider value={navTheme}>
      <SkyBackground>
      <WebContainer>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          {/* Guests can browse (tabs); logged-in users skip the auth group. */}
          <Stack.Screen name="(auth)"  redirect={!!userId} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="game/[sessionId]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="community/[id]/chat" options={{ presentation: 'card' }} />
          <Stack.Screen name="tournament/[id]"     options={{ presentation: 'card' }} />
        </Stack>
      </WebContainer>
      {showIntro && <IntroKicker onDone={() => setShowIntro(false)} />}
      </SkyBackground>
      </NavThemeProvider>
    </ErrorBoundary>
  );
}

// ── Root export ────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}
