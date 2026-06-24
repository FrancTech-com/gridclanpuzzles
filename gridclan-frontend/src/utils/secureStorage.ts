/**
 * Cross-platform secure key/value storage.
 *
 * Native (iOS/Android): expo-secure-store — hardware-backed keychain/keystore.
 * Web: there is no equivalent hardware-backed store in the browser, so we use
 *   - an in-memory cache (primary; cleared on tab close), plus
 *   - a localStorage mirror so tokens survive a page reload.
 * This is standard practice for web SPAs; web security differs from native and
 * cannot match a hardware keystore (documented trade-off).
 *
 * The API mirrors SecureStore's async signature so call sites are identical on
 * every platform:  getItem / setItem / deleteItem  → Promise.
 */
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// ── Web implementation (memory + localStorage fallback) ─────────────────────
// Access token lives primarily in memory; refresh token (and an access-token
// fallback for reloads) lives in localStorage. Reads prefer memory.
const memoryStore = new Map<string, string>();
const WEB_KEY_PREFIX = 'gridclan.secure.';

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false; // access can throw in some privacy modes / SSR prerender
  }
}

async function webGetItem(key: string): Promise<string | null> {
  if (memoryStore.has(key)) return memoryStore.get(key) ?? null;
  if (!hasLocalStorage()) return null;
  try {
    const value = window.localStorage.getItem(WEB_KEY_PREFIX + key);
    if (value !== null) memoryStore.set(key, value); // warm the cache
    return value;
  } catch {
    return null;
  }
}

async function webSetItem(key: string, value: string): Promise<void> {
  memoryStore.set(key, value);
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(WEB_KEY_PREFIX + key, value);
  } catch {
    // Quota / privacy mode — memory cache still holds it for this session.
  }
}

async function webDeleteItem(key: string): Promise<void> {
  memoryStore.delete(key);
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(WEB_KEY_PREFIX + key);
  } catch {
    // ignore
  }
}

// ── Native implementation (lazy import keeps web bundle clean) ──────────────
// expo-secure-store is required lazily so the module is never pulled into the
// web bundle, where it has no implementation.
function nativeStore() {
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) return webGetItem(key);
  return nativeStore().getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) return webSetItem(key, value);
  await nativeStore().setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) return webDeleteItem(key);
  await nativeStore().deleteItemAsync(key);
}

// Default export grouping for ergonomic imports.
export const secureStorage = { getItem, setItem, deleteItem };
export default secureStorage;
