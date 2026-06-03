/**
 * Single customer-facing score display authority.
 *
 * Every surface that prints the overall score or a normalized category
 * score to a customer (cover, score card, category cards, admin
 * preview, email, PDF) MUST format through this helper so a raw float
 * (e.g. 55.51866666666667) can never leak as "55.5/100". The
 * deterministic engine keeps full precision in the DB; the customer
 * only ever sees a clamped integer.
 *
 * Pure — no I/O, no Date, no random.
 */

/** Placeholder shown when a score is genuinely unavailable. */
export const SCORE_PLACEHOLDER = "—";

/**
 * Format a 0–100 score for display: clamped, rounded to an integer,
 * returned as a string. Null/undefined/non-finite → the placeholder.
 *
 *   formatDisplayScore(55.51866666666667) // "56"
 *   formatDisplayScore(100)               // "100"
 *   formatDisplayScore(null)              // "—"
 */
export function formatDisplayScore(
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return SCORE_PLACEHOLDER;
  }
  const clamped = Math.min(100, Math.max(0, value));
  return String(Math.round(clamped));
}

/**
 * `"56 / 100"` form for surfaces that print the full ratio inline.
 * Returns the placeholder ratio when unavailable so callers don't have
 * to branch.
 */
export function formatDisplayScoreOutOf100(
  value: number | null | undefined,
): string {
  return `${formatDisplayScore(value)} / 100`;
}
