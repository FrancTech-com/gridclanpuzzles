import AsyncStorage from '@react-native-async-storage/async-storage';
import { adsApi } from '@api/index';
import type { AdProvider, AdsStatus } from '@gridtypes/index';

/**
 * Ad delivery — the earning mechanism that funds player payouts.
 *
 * THREE ad networks form a failover chain (each with its own role: primary →
 * secondary → tertiary, from the server's /ads/status). If one network can't
 * serve an ad, the next is tried, so one provider outage never breaks the app.
 *
 * Each network plugs in as an AdAdapter registered under the provider id the
 * server reports (e.g. "admob"). The real SDK adapters are added when the
 * network accounts exist (their SDKs need native builds via EAS); until then
 * the server-controlled TEST MODE plays a built-in placeholder ad so the whole
 * earn → wallet → withdraw loop works end-to-end in development.
 *
 * Money flow stays server-authoritative: the client only reports "this ad
 * session finished"; the amount is fixed server-side when the session is
 * issued, credited at most once, capped per day.
 */

/** What a network adapter must do: show one ad to completion. */
export interface AdAdapter {
  /**
   * Resolve true only when the ad was actually watched to the end.
   * `personalized` comes from the server (adult + explicit consent only) —
   * adapters MUST request non-personalised ads when it is false (e.g. npa=1),
   * which is also the safe default for minors and unconsented users.
   */
  showAd(appKey: string, placement: 'REWARDED' | 'POST_GAME',
         personalized: boolean): Promise<boolean>;
}

const adapters = new Map<string, AdAdapter>();

/** Wire a network's SDK in (called once at startup per integrated network). */
export function registerAdAdapter(providerId: string, adapter: AdAdapter) {
  adapters.set(providerId, adapter);
}

export function hasAdapter(providerId: string): boolean {
  return adapters.has(providerId);
}

// ── Device id (anti-fraud) ────────────────────────────────────────────────────
// A random install id, generated once and persisted. Sent with /ads/start so
// the server's daily cap also binds the device — ten accounts on one phone
// share one cap. Not a hardware id; carries no personal data.

const DEVICE_ID_KEY = 'ad_device_id';
let deviceId: string | null = null;

export async function getAdDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) { deviceId = stored; return stored; }
  } catch { /* storage unavailable — fall through to a fresh id */ }
  const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
  deviceId = fresh;
  AsyncStorage.setItem(DEVICE_ID_KEY, fresh).catch(() => {});
  return fresh;
}

// ── Server status (cached briefly so game-over checks don't spam the API) ────

let cached: AdsStatus | null = null;
let cachedAt = 0;
const STATUS_TTL_MS = 60_000;

export async function getAdsStatus(force = false): Promise<AdsStatus | null> {
  const now = Date.now();
  if (!force && cached && now - cachedAt < STATUS_TTL_MS) return cached;
  try {
    const res = await adsApi.status();
    cached = res.data;
    cachedAt = now;
    return cached;
  } catch {
    return cached;   // stale beats broken; null if never loaded
  }
}

export function invalidateAdsStatus() { cached = null; }

// ── Playback: run the failover chain ─────────────────────────────────────────

export interface PlayResult {
  watched: boolean;
  providerId?: string;
  /** True when no provider could even try (nothing wired / all failed). */
  unavailable?: boolean;
}

/**
 * Try each provider in role order until one shows an ad to completion.
 * `placeholder` (from the AdModal, test mode only) plays the built-in ad
 * when the server allows it.
 */
export async function playThroughChain(
  status: AdsStatus,
  placement: 'REWARDED' | 'POST_GAME',
  placeholder?: () => Promise<boolean>,
): Promise<PlayResult> {
  // Non-personalised unless the server says this player may see personalised
  // ads (known adult + explicit consent) — never decided client-side.
  const personalized = !!status.personalizedAllowed;
  for (const p of status.providers as AdProvider[]) {
    const adapter = adapters.get(p.id);
    if (!adapter) continue;   // SDK not integrated in this build — next role
    try {
      const watched = await adapter.showAd(p.appKey, placement, personalized);
      if (watched) return { watched: true, providerId: p.id };
      return { watched: false, providerId: p.id };   // shown but skipped/closed
    } catch {
      // This network failed to load/serve — fall through to the next role.
    }
  }
  if (status.testMode && placeholder) {
    const watched = await placeholder();
    return { watched, providerId: 'placeholder' };
  }
  return { watched: false, unavailable: true };
}
