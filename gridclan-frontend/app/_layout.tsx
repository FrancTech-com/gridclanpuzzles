import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { store, persistor, RootState, AppDispatch } from '@store/index';
import { hydrateAuth } from '@store/slices/authSlice';
import { Colors } from '@theme/index';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { installGlobalErrorHandlers } from '@services/errorReporter';
import { startActivityTracker, stopActivityTracker } from '@services/activityTracker';
import { installDeepLinkValidation, warnIfDeviceRooted } from '@services/deviceSecurity';
import { loadPersistedLanguage } from '@i18n/index'; // also runs i18next init before first render

SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    dispatch(hydrateAuth()).finally(() => SplashScreen.hideAsync());
    loadPersistedLanguage();                    // user's language choice, if any
    warnIfDeviceRooted();                       // soft warning, never blocks
    return installDeepLinkValidation();
  }, []);

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

  return (
    <ErrorBoundary>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(auth)"  redirect={!!userId} />
        <Stack.Screen name="(tabs)"  redirect={!userId}  />
        <Stack.Screen name="game/[sessionId]" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="community/[id]/chat" options={{ presentation: 'card' }} />
        <Stack.Screen name="tournament/[id]"     options={{ presentation: 'card' }} />
      </Stack>
    </ErrorBoundary>
  );
}

// ── Root export ────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>
        <RootNavigator />
      </PersistGate>
    </Provider>
  );
}
