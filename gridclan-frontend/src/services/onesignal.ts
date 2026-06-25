import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * OneSignal web push (PWA). No-op on native and when ONESIGNAL_APP_ID is unset.
 * The SDK script is loaded in app/+html.tsx; we drive it via OneSignalDeferred.
 *
 * Players are identified to OneSignal by their GridClan userId (external id),
 * so the backend can target "your turn" pushes by userId.
 */
const APP_ID = (Constants.expoConfig?.extra?.ONESIGNAL_APP_ID as string | undefined) || '';

function isWeb() { return Platform.OS === 'web' && typeof window !== 'undefined'; }
function ready() { return isWeb() && !!APP_ID; }

function defer(cb: (os: any) => void | Promise<void>) {
  const w = window as any;
  w.OneSignalDeferred = w.OneSignalDeferred || [];
  w.OneSignalDeferred.push(cb);
}

let inited = false;

export function initOneSignal() {
  if (!ready() || inited) return;
  inited = true;
  defer(async (OneSignal) => {
    try { await OneSignal.init({ appId: APP_ID, allowLocalhostAsSecureOrigin: true }); }
    catch { /* ignore */ }
  });
}

/** Link the push subscription to this user and ask for permission. */
export function setOneSignalUser(userId: string) {
  if (!ready()) return;
  defer(async (OneSignal) => {
    try {
      await OneSignal.login(userId);
      if (OneSignal.Notifications && OneSignal.Notifications.permission === false) {
        await OneSignal.Notifications.requestPermission();
      }
    } catch { /* ignore */ }
  });
}

export function clearOneSignalUser() {
  if (!ready()) return;
  defer(async (OneSignal) => { try { await OneSignal.logout(); } catch { /* ignore */ } });
}
