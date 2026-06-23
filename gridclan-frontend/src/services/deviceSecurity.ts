/**
 * Device-trust checks (blueprint § SECURITY — FRONTEND):
 *   - Jailbreak/root detection — soft warning, never a hard block.
 *   - Deep link validation — incoming URLs must match a known app route.
 */
import { Alert } from 'react-native';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';

let rootWarningShown = false;

/**
 * One soft warning per app launch on rooted/jailbroken devices. Detection is
 * best-effort (Expo marks it experimental) — failures are treated as
 * not-rooted, and play is never blocked either way.
 */
export async function warnIfDeviceRooted(): Promise<void> {
  if (rootWarningShown) return;
  try {
    if (await Device.isRootedExperimentalAsync()) {
      rootWarningShown = true;
      Alert.alert(
        'Security notice',
        'This device appears to be rooted or jailbroken. Your GridClan account '
          + 'may be less secure on this device. You can keep playing, but '
          + 'consider using a non-rooted device.',
      );
    }
  } catch {
    // Detection unavailable — assume fine, never block
  }
}

/**
 * Route prefixes a deep link may open. Anything else (or any link smuggling
 * an unexpected scheme) is rejected before navigation.
 */
const ALLOWED_PATH_PREFIXES = [
  '',            // root
  '(auth)',
  '(tabs)',
  'game',
  'community',
  'tournament',
  'profile',
];

export function isAllowedDeepLink(url: string): boolean {
  try {
    const { path, scheme } = Linking.parse(url);
    if (scheme && !['gridclan', 'https', 'exp', 'exps'].includes(scheme)) return false;
    const first = (path ?? '').replace(/^\/+/, '').split('/')[0];
    return ALLOWED_PATH_PREFIXES.includes(first);
  } catch {
    return false;
  }
}

/**
 * Logs (and lets callers ignore) deep links that don't match an app route.
 * expo-router only navigates to file-defined routes, so this is defence in
 * depth: it catches probing/malformed links early and keeps a breadcrumb.
 */
export function installDeepLinkValidation(): () => void {
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (!isAllowedDeepLink(url)) {
      console.warn('[deep-link] rejected unrecognised URL:', url);
    }
  });
  return () => sub.remove();
}
