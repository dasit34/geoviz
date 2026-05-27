/**
 * Brand / Entity Clarity — 10 pts.
 *
 * Reads `preflight.entityConsistency` (extracted entities + confidence)
 * and `schema.present_fields` (sameAs presence).
 *
 * Anchors:
 *   0–2   broken                 (no resolvable business name anywhere)
 *   3–4   minimal                 (name present on 1 surface only)
 *   5–7   default                 (name consistent across 2+ surfaces)
 *   8–9   strong                  (name consistent + sameAs anchors)
 *   10    elite                   (name everywhere + sameAs + organization schema)
 */

import type { CategoryScoreInternal, Evidence, Issue } from "../types";
import { CATEGORY_MAX } from "../types";

const EVIDENCE_USED = [
  "entity.name",
  "entity.surface_agreement",
  "schema.present_fields",
];

function build(
  score: number,
  signals: string[],
  issues: Issue[],
  confidence: number,
): CategoryScoreInternal {
  return {
    key: "brand",
    score,
    max: CATEGORY_MAX.brand,
    signals,
    issues,
    reason: signals[0] ?? "No signal",
    evidence_used: EVIDENCE_USED,
    category_confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function scoreBrand(evidence: Evidence): CategoryScoreInternal {
  const max = CATEGORY_MAX.brand;
  const signals: string[] = [];
  const issues: Issue[] = [];

  const e = evidence.entity;
  if (!e) {
    signals.push("Entity evidence missing");
    return build(3, signals, issues, 0.3);
  }

  const namesBySurface = [
    e.name.schema,
    e.name.homepage,
    e.name.footer,
  ].filter((n): n is string => typeof n === "string" && n.trim().length > 0);

  if (namesBySurface.length === 0) {
    signals.push("No business name extractable from any surface");
    issues.push({
      id: "brand.unresolved_entity",
      severity: "critical",
      category_key: "brand",
      weight: max,
      message: "Business name not found in schema, homepage, or footer",
    });
    return build(1, signals, issues, 1.0);
  }

  // Normalise + dedup to see how many *distinct* names show up.
  const normalised = new Set(
    namesBySurface.map((n) => n.toLowerCase().replace(/\s+/g, " ").trim()),
  );

  let score: number;
  if (normalised.size === 1 && namesBySurface.length >= 3) {
    score = 8; // Same name on all 3 surfaces
    signals.push("Business name consistent across schema + homepage + footer");
  } else if (normalised.size === 1) {
    score = 6;
    signals.push("Business name consistent on the surfaces it appears");
  } else if (normalised.size === 2 && namesBySurface.length >= 2) {
    score = 4;
    signals.push("Business name varies between surfaces");
    issues.push({
      id: "brand.unresolved_entity",
      severity: "warning",
      category_key: "brand",
      weight: max,
      message: "Business name varies across schema / homepage / footer",
    });
  } else {
    score = 3;
    issues.push({
      id: "brand.unresolved_entity",
      severity: "warning",
      category_key: "brand",
      weight: max,
      message: "Business identity unclear — multiple name variants detected",
    });
  }

  // sameAs anchors — give the entity authoritative external proof.
  const hasSameAs = (evidence.schema?.present_fields ?? []).some(
    (f) => f.toLowerCase() === "sameas",
  );
  if (hasSameAs) {
    signals.push("sameAs anchors present in JSON-LD");
    score += 1;
  } else {
    issues.push({
      id: "brand.no_sameas",
      severity: "info",
      category_key: "brand",
      weight: max,
      message: "No sameAs links to external authorities (Google profile, directories)",
    });
  }

  // Surface-agreement confidence lift — ramps from agreement=0.8 (bonus 0)
  // to agreement=1.0 (bonus +1). Previously a binary +1 at >= 0.95, which
  // created a 1-pt cliff at 0.94→0.95 on small analyzer drift. Anchor
  // preserved at agreement=1.0 → +1; anti-double-bonus guard preserved.
  if (typeof e.surface_agreement === "number" && score < max) {
    const agreementBonus = Math.max(
      0,
      Math.min(1, (e.surface_agreement - 0.8) / 0.2),
    );
    score = Math.min(max, score + agreementBonus);
  }

  score = clamp(score, 0, max);
  const confidence =
    typeof e.surface_agreement === "number"
      ? Math.max(0.6, e.surface_agreement)
      : 0.7;
  return build(score, signals, issues, confidence);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
