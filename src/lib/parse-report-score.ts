/**
 * Score-extraction wrapper used by the admin dashboard cards.
 *
 * 2026-05-15 launch-hardening: this module previously did its OWN
 * regex against the audit markdown ("first `<n>/100 — <status>`
 * pattern wins"), which ignored the canonical-overall fix that PR
 * #11 added to `parseReportScoreBreakdown` in `parse-report.ts`.
 * Result: the same audit showed two different scores depending on
 * surface — admin dashboard read the model's declared hero (e.g.
 * 38) while the customer-facing PDF + print page read the rubric
 * sum (e.g. 42).
 *
 * The fix: this module now delegates to `parseReportScoreBreakdown`
 * so admin dashboard, PDF, print page, and email preview all read
 * the SAME canonical overall. The legacy regex shape is preserved
 * for callers — only the underlying source of truth changed.
 *
 * Why a wrapper rather than just deleting this file: many callers
 * are typed against `{ score, status } | null` (no categories, no
 * rubricSum). A direct switch would touch every caller. The wrapper
 * keeps the call surface intact while pointing the value at the
 * canonical pipeline.
 */

import {
  bandLabelForOverall,
  parseReportScoreBreakdown,
} from "@/lib/parse-report";

export function parseReportScore(
  md: string | null | undefined,
): { score: number; status: string | null } | null {
  if (!md) return null;
  // Single canonical pipeline: same parser the PDF/print/email
  // surfaces use. Returns rubric-sum-derived overall when all six
  // categories parsed (with 5-of-6 derived-fill fallback added in
  // PR #14), or the model's declared header as a last-resort
  // fallback when sub-scores can't be reconstructed.
  const breakdown = parseReportScoreBreakdown(md);
  if (typeof breakdown.overall !== "number") return null;

  // Emit a single greppable consistency line whenever the model's
  // declared hero disagreed with the canonical sum. Pre-existing
  // `[geo-score-consistency] mismatch` fires inside the parser; this
  // is a SURFACE-level marker so we can grep when an admin reads
  // a row that had to be reconciled.
  if (
    typeof breakdown.declaredOverall === "number" &&
    typeof breakdown.rubricSum === "number" &&
    breakdown.declaredOverall !== breakdown.rubricSum
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[geo-score-consistency] surface read canonical=${breakdown.overall} declaredHero=${breakdown.declaredOverall} (admin surface using canonical)`,
    );
  }

  // Prefer the canonical band label derived from the canonical
  // overall, NOT whatever band string the model happened to emit
  // alongside its declared hero. Falls back to the parsed status
  // string (e.g. for older audits where the model's band is the
  // only signal we have).
  const status = bandLabelForOverall(breakdown.overall) ?? breakdown.status;
  return { score: breakdown.overall, status };
}

export type ScoreTone = "ok" | "warn" | "bad" | "muted";

export function scoreTone(score: number | null | undefined): ScoreTone {
  if (typeof score !== "number") return "muted";
  if (score >= 75) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}
