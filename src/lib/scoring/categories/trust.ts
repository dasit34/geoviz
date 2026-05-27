/**
 * Local Trust Signals — 20 pts.
 *
 * Trust is the category where the V1 evidence catalog is weakest (no
 * third-party API verification of reviews / ratings / licenses). We
 * score from what's available:
 *   • NAP (name / phone / address) consistency across schema + homepage + footer
 *   • surface-agreement confidence (preflight.entityConsistency)
 *   • presence of an AggregateRating in JSON-LD (a one-sided signal that
 *     review proof exists at all)
 *
 * Ladder anchors:
 *   0–4   broken                 (severe NAP inconsistencies OR no entity at all)
 *   5–9   minimal                 (partial NAP, no review signals)
 *   10–13 default                 (NAP consistent on 2 of 3 surfaces)
 *   14–17 strong                  (NAP consistent + review signal in schema)
 *   18–20 elite                   (NAP consistent across all 3 + review + sameAs)
 */

import type { CategoryScoreInternal, Evidence, Issue } from "../types";
import { CATEGORY_MAX } from "../types";

const EVIDENCE_USED = [
  "entity.surface_agreement",
  "entity.inconsistencies",
  "entity.analyzer_score",
  "schema.detected_types",
];

function build(
  score: number,
  signals: string[],
  issues: Issue[],
  confidence: number,
): CategoryScoreInternal {
  return {
    key: "trust",
    score,
    max: CATEGORY_MAX.trust,
    signals,
    issues,
    reason: signals[0] ?? "No signal",
    evidence_used: EVIDENCE_USED,
    category_confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function scoreTrust(evidence: Evidence): CategoryScoreInternal {
  const max = CATEGORY_MAX.trust;
  const signals: string[] = [];
  const issues: Issue[] = [];

  const e = evidence.entity;
  const s = evidence.schema;

  if (!e) {
    signals.push("Entity consistency not checked (evidence missing)");
    return build(5, signals, issues, 0.3);
  }

  const agreement = e.surface_agreement ?? 0;
  const inconsistencyCount = e.inconsistencies.length;
  const hasReviewSchema = (s?.detected_types ?? []).some((t) =>
    /AggregateRating|Review/i.test(t),
  );

  // Hard failure — many NAP inconsistencies.
  if (inconsistencyCount >= 3) {
    signals.push(`${inconsistencyCount} NAP inconsistencies detected`);
    issues.push({
      id: "trust.nap_inconsistent",
      severity: "critical",
      category_key: "trust",
      weight: max,
      message: "Name / phone / address conflict across surfaces — AI can't resolve one business",
    });
    return build(3, signals, issues, 0.9);
  }

  let score = 8;
  if (agreement >= 0.9) {
    signals.push("NAP consistent across schema / homepage / footer");
    score += 5;
  } else if (agreement >= 0.7) {
    signals.push("NAP mostly consistent (minor surface drift)");
    score += 3;
    issues.push({
      id: "trust.low_surface_agreement",
      severity: "warning",
      category_key: "trust",
      weight: max,
      message: "NAP drifts between schema, homepage, and footer",
    });
  } else if (agreement > 0) {
    signals.push("NAP partially consistent");
    score += 1;
    issues.push({
      id: "trust.low_surface_agreement",
      severity: "warning",
      category_key: "trust",
      weight: max,
      message: "NAP only partially consistent across surfaces",
    });
  } else if (inconsistencyCount > 0) {
    signals.push("NAP inconsistencies present");
    issues.push({
      id: "trust.nap_inconsistent",
      severity: "warning",
      category_key: "trust",
      weight: max,
      message: "Name / phone / address inconsistent between surfaces",
    });
  }

  if (hasReviewSchema) {
    signals.push("Review / AggregateRating schema present");
    score += 4;
  } else {
    signals.push("No review/rating signal in schema");
    issues.push({
      id: "trust.no_reviews_signal",
      severity: "info",
      category_key: "trust",
      weight: max,
      message: "No review or rating signal AI can read",
    });
  }

  // Sanity-cap against the analyzer's own consistency score.
  // Continuous (dropped Math.round) so an analyzer score shifting by 1
  // unit doesn't flip the ceiling by a full point. Anchor preserved:
  // analyzer=100 → ceiling=max+2. NOTE: the inconsistency hard-floor at
  // count≥3 and the agreement-tier ladder (0.7/0.9) are deliberately NOT
  // smoothed in this stage — they're Stage 2 work.
  if (typeof e.analyzer_score === "number") {
    const ceiling = (e.analyzer_score / 100) * max + 2;
    if (score > ceiling) score = ceiling;
  }

  score = clamp(score, 0, max);
  const confidence =
    typeof e.analyzer_score === "number"
      ? Math.max(0.6, e.analyzer_score / 100)
      : 0.7;
  return build(score, signals, issues, confidence);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
