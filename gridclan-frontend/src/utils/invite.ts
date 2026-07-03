import { Platform, Share } from 'react-native';
import Constants from 'expo-constants';

/**
 * Friend-invite links.
 *
 * Sharing only a code forces the recipient to open the app, find the right
 * game, tap "Have a code?", and type it. A tappable link removes all of that:
 * it points at the public web export (Netlify), which is the SAME expo-router
 * app, so the URL resolves to a real screen that joins the game automatically.
 *
 *   Real-time games → /j/<game>/<code>   (auto-join, see app/j/[game]/[code].tsx)
 *   Async challenge → /challenge/<code>  (existing hub handles accept)
 *
 * We deliberately target the web origin (not the gridclan:// scheme) so the
 * link works for EVERYONE — no app install, no universal-link setup required.
 * A friend with the native app installed still gets a fully playable web game;
 * upgrading these to true universal/app links is a documented future step.
 */
const WEB_BASE_URL: string = (
  (Constants.expoConfig?.extra?.WEB_BASE_URL as string | undefined) ??
  'https://gridclanpuzzle.win'
).replace(/\/+$/, '');

export type RealtimeGame = 'scrabble' | 'gomoku' | 'battleship';

/** Tappable link that drops a friend straight into a real-time game by code. */
export function gameInviteLink(game: RealtimeGame, code: string): string {
  return `${WEB_BASE_URL}/j/${game}/${encodeURIComponent(code)}`;
}

/** Tappable link to an async friend challenge (the hub handles accept/result). */
export function challengeInviteLink(code: string): string {
  return `${WEB_BASE_URL}/challenge/${encodeURIComponent(code)}`;
}

/** Tappable link that joins a community and lands in its chat (auto-join,
 *  see app/j/[game]/[code].tsx — communities join by id, not code). */
export function communityInviteLink(communityId: string): string {
  return `${WEB_BASE_URL}/j/community/${encodeURIComponent(communityId)}`;
}

/**
 * Tappable link inviting someone to join the app itself (not a specific game).
 * Points at the public web home so anyone can play instantly with no install,
 * and a `ref` carries who invited them for future referral attribution.
 */
export function appInviteLink(ref?: string): string {
  return ref ? `${WEB_BASE_URL}/?ref=${encodeURIComponent(ref)}` : WEB_BASE_URL;
}

/**
 * Share an invite via the best channel available, falling back gracefully:
 *   native → OS share sheet
 *   web    → Web Share API → clipboard (copy the link)
 *
 * `message` should already contain `link` so recipients on channels that strip
 * the structured url (most do) still get something tappable. `onCopied` lets the
 * caller show a localized "link copied" toast when we fall back to clipboard.
 * Cancellation / unsupported APIs resolve quietly.
 */
/**
 * Validate a `next` redirect target carried through auth (e.g. from an invite
 * link). Only same-app absolute paths are allowed — never an external URL or a
 * protocol-relative `//host` — so a crafted link can't bounce a freshly
 * signed-in user off-site. Returns the safe path, or undefined to use a default.
 */
export function safeNextPath(next?: string | string[] | null): string | undefined {
  const v = Array.isArray(next) ? next[0] : next;
  if (!v || !v.startsWith('/') || v.startsWith('//')) return undefined;
  return v;
}

export async function shareInvite(opts: {
  message: string;
  link: string;
  onCopied?: () => void;
}): Promise<void> {
  const { message, link, onCopied } = opts;
  try {
    if (Platform.OS === 'web') {
      const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) { await nav.share({ text: message, url: link }); return; }
      if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(link); onCopied?.(); return; }
      return;
    }
    await Share.share({ message });
  } catch {
    /* user cancelled or API unavailable — nothing to do */
  }
}
