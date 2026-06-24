import { AppState, AppStateStatus } from 'react-native';
import { getItem } from '@utils/secureStorage';
import Constants from 'expo-constants';

const BASE_URL: string =
  (Constants.expoConfig?.extra?.API_BASE_URL as string | undefined) ??
  'https://api.gridclanpuzzle.win';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let isForegrounded = true;

/** Send a single heartbeat to POST /user/heartbeat. */
async function sendHeartbeat(): Promise<void> {
  if (!isForegrounded) return;
  try {
    const token = await getItem('access_token');
    if (!token) return;

    await fetch(`${BASE_URL}/user/heartbeat`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  } catch {
    // Silent — heartbeat is best-effort
  }
}

/**
 * Start the activity tracker.
 * Call once when the user is authenticated (inside RootNavigator useEffect).
 * Sends a heartbeat immediately, then every 60 seconds while the app is
 * in the foreground. Stops when the app backgrounds or the user logs out.
 */
export function startActivityTracker(): void {
  stopActivityTracker();

  isForegrounded = AppState.currentState === 'active';
  sendHeartbeat();

  intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  appStateSubscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      isForegrounded = nextState === 'active';
      if (isForegrounded) {
        // Immediate ping on foreground restore
        sendHeartbeat();
      }
    }
  );
}

/** Stop the tracker (call on logout or when userId becomes null). */
export function stopActivityTracker(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  appStateSubscription?.remove();
  appStateSubscription = null;
}
