/**
 * Schema / Structured Data category — 25 pts.
 *
 * Ladder anchors (ported from `scripts/geo-worker.ts` Calibration v2):
 *   0–3   broken / no JSON-LD                    (no JSON-LD blocks at all)
 *   4–7   minimal                                 (1+ block but no business entity types)
 *   8–12  default for a working site              (LocalBusiness or Organization with most required fields)
 *   13–17 strong                                  (LocalBusiness + sameAs OR additional types present)
 *   18–22 machine-readable                        (multiple complementary types, no malformed fields)
 *   23–25 elite                                   (FAQPage + LocalBusiness + sameAs + complete fields)
 *
 * Pure — same evidence ⇒ same score.
 */

import type { CategoryScoreInternal, Evidence, Issue } from "../types";
import { CATEGORY_MAX } from "../types";

const REQUIRED_LOCAL_BUSINESS_FIELDS = new Set([
  "name",
  "address",
  "telephone",
  "url",
]);

const EVIDENCE_USED = [
  "schema.raw_jsonld_block_count",
  "schema.detected_types",
  "schema.present_fields",
  "schema.missing_fields",
  "schema.malformed_fields",
];

function build(
  score: number,
  signals: string[],
  issues: Issue[],
  confidence: number,
): CategoryScoreInternal {
  return {
    key: "schema",
    score,
    max: CATEGORY_MAX.schema,
    signals,
    issues,
    reason: signals[0] ?? "No signal",
    evidence_used: EVIDENCE_USED,
    category_confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function scoreSchema(evidence: Evidence): CategoryScoreInternal {
  const max = CATEGORY_MAX.schema;
  const signals: string[] = [];
  const issues: Issue[] = [];

  const s = evidence.schema;

  // Tier 0 — no schema evidence at all.
  if (!s || s.raw_jsonld_block_count === 0) {
    signals.push("No JSON-LD blocks detected");
    issues.push({
      id: "schema.no_jsonld",
      severity: "critical",
      category_key: "schema",
      weight: max,
      message: "No structured data on the homepage",
    });
    return build(2, signals, issues, 1.0);
  }

  const types = new Set(s.detected_types.map((t) => t.toLowerCase()));
  const hasLocalBusinessFamily =
    types.has("localbusiness") ||
    [...types].some((t) =>
      [
        "plumber",
        "electrician",
        "roofer",
        "dentist",
        "homeandconstructionbusiness",
        "professionalservice",
        "legalservice",
        "attorney",
        "medicalbusiness",
        "medicalclinic",
        "store",
        "restaurant",
      ].includes(t),
    );
  const hasOrganization = types.has("organization");
  const hasFaqPage = types.has("faqpage");
  const hasSameAs = s.present_fields.some((f) => f.toLowerCase() === "sameas");
  const hasAggregateRating = types.has("aggregaterating") || s.present_fields.some((f) => f.toLowerCase() === "aggregaterating");

  const presentRequired = new Set(
    s.present_fields.map((f) => f.toLowerCase()),
  );
  const requiredCovered = [...REQUIRED_LOCAL_BUSINESS_FIELDS].filter((f) =>
    presentRequired.has(f),
  ).length;
  const requiredMax = REQUIRED_LOCAL_BUSINESS_FIELDS.size;

  if (s.raw_jsonld_block_count > 0) {
    signals.push(`Detected ${s.raw_jsonld_block_count} JSON-LD block(s)`);
  }
  if (types.size > 0) {
    signals.push(`Schema types: ${[...types].join(", ")}`);
  }

  // Tier 1 — JSON-LD exists but no business entity.
  if (!hasLocalBusinessFamily && !hasOrganization) {
    issues.push({
      id: "schema.no_localbusiness",
      severity: "critical",
      category_key: "schema",
      weight: max,
      message: "No LocalBusiness or Organization JSON-LD block",
    });
    signals.push("No LocalBusiness/Organization entity in schema");
    return build(5, signals, issues, 0.95);
  }

  // Tier 2 — entity present. Score = baseline + field coverage + bonuses.
  let score = 8; // default working-site floor
  signals.push(
    hasLocalBusinessFamily
      ? "LocalBusiness-family entity present"
      : "Organization entity present (no LocalBusiness)",
  );

  // Required-field coverage moves us through the 8–12 band.
  const fieldCoverage = requiredCovered / requiredMax; // 0..1
  score += Math.round(fieldCoverage * 4); // up to +4 → 12 baseline

  if (s.missing_fields.length > 0) {
    signals.push(`Missing fields: ${s.missing_fields.join(", ")}`);
    issues.push({
      id: "schema.missing_required_fields",
      severity: "warning",
      category_key: "schema",
      weight: max,
      message: `Required entity fields missing: ${s.missing_fields.join(", ")}`,
    });
  }

  if (s.malformed_fields.length > 0) {
    signals.push(`Malformed fields: ${s.malformed_fields.join(", ")}`);
    issues.push({
      id: "schema.malformed_fields",
      severity: "warning",
      category_key: "schema",
      weight: max,
      message: `Schema fields malformed: ${s.malformed_fields.join(", ")}`,
    });
    score -= 1;
  }

  // Tier 3 — strong (13–17): sameAs + complementary types.
  if (hasSameAs) {
    signals.push("sameAs links present");
    score += 2;
  } else if (hasLocalBusinessFamily) {
    issues.push({
      id: "brand.no_sameas",
      severity: "info",
      category_key: "schema",
      weight: max,
      message: "No sameAs links — entity has no external authority anchors",
    });
  }

  // Tier 4 — machine-readable (18–22): multiple complementary types.
  if (types.size >= 3) {
    signals.push(`Multiple complementary types (${types.size})`);
    score += 3;
  } else if (types.size === 2) {
    score += 1;
  }

  // Tier 5 — elite (23–25): FAQPage + aggregate rating round out the set.
  if (hasFaqPage) {
    signals.push("FAQPage schema present");
    score += 2;
  } else {
    issues.push({
      id: "schema.no_faqpage",
      severity: "info",
      category_key: "schema",
      weight: max,
      message: "No FAQPage schema — AI cannot directly cite FAQ answers",
    });
  }

  if (hasAggregateRating) {
    signals.push("AggregateRating present");
    score += 1;
  }

  // Clamp to category max.
  score = clamp(score, 0, max);

  // Confidence — proxied by the analyzer's own coverage when present.
  const confidence =
    typeof s.analyzer_score === "number"
      ? Math.max(0.7, s.analyzer_score / 100)
      : 0.8;

  return build(score, signals, issues, confidence);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
