/**
 * Reward-points display rate — the ONLY place the conversion lives.
 *
 * The server wallet is denominated in real currency (UGX); the app displays
 * it as reward points at 1 point = UGX 0.2 (so 5 points per currency unit).
 * Changing this constant rescales every screen at once — but it must match
 * what the legal pages state, so update those together.
 */
export const POINTS_PER_CURRENCY_UNIT = 5;

/** Currency amount (from the server) → points shown to the player. */
export const toPoints = (amount: number): number =>
  Math.round(amount * POINTS_PER_CURRENCY_UNIT);

/** Points typed by the player → currency amount sent to the server. */
export const toAmount = (points: number): number =>
  points / POINTS_PER_CURRENCY_UNIT;

/** Format a server currency amount as a points label, e.g. "2,500 points". */
export const fmtPoints = (amount: number): string => {
  const p = toPoints(amount);
  return `${p.toLocaleString()} ${p === 1 ? 'point' : 'points'}`;
};
