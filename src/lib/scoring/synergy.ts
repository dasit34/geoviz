/**
 * Structural Synergy Bonus — three tiers, capped at +5.
 *
 * Ported from `scripts/calibration-recalc.ts:167-189` and extended
 * with an `elite` tier per the v1 review brief.
 *
 *   ELITE     +5   primary gate MET AND ≥3 schema types
 *                  AND sameAs present AND FAQPage detected
 *   PRIMARY   +3   primary gate MET AND ≥1 machine-readable signal
 *   PARTIAL   +1   relaxed gate MET (schema ≥ 14 + relaxed others)
 *   NONE       0   otherwise
 *
 * Primary gate (frozen): content ≥ 12 AND brand ≥ 8 AND tech ≥ 7
 *                       AND crawler ≥ 15.
 *
 * Hard cap: `Math.min(applied, 5)` — defense in depth.
 *
 * Stores `synergy_bonus_reason` for the trace.
 * Pure.
 */

import type {
  CategoryKey,
  CategoryScoreInternal,
  Evidence,
  SynergyResult,
} from "./types";

const SYNERGY_HARD_CAP = 5;

function hasMachineReadableSignal(
  evidence: Evidence,
  schema: CategoryScoreInternal,
): boolean {
  const types = evidence.schema?.detected_types ?? [];
  const lowered = types.map((t) => t.toLowerCase());
  if (lowered.includes("localbusiness")) return true;
  if (
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
    ].some((t) => lowered.includes(t))
  )
    return true;

  const hasSameAs = (evidence.schema?.present_fields ?? []).some(
    (f) => f.toLowerCase() === "sameas",
  );
  if (hasSameAs) return true;

  if (
    evidence.content?.parsed_by_readability === true &&
    evidence.content?.has_h1 === true &&
    schema.score >= 12
  )
    return true;

  return false;
}

function isEliteTier(
  evidence: Evidence,
  schema: CategoryScoreInternal,
): boolean {
  const types = evidence.schema?.detected_types ?? [];
  const lowered = new Set(types.map((t) => t.toLowerCase()));
  const hasSameAs = (evidence.schema?.present_fields ?? []).some(
    (f) => f.toLowerCase() === "sameas",
  );
  const hasFaq = lowered.has("faqpage");
  void schema;
  return lowered.size >= 3 && hasSameAs && hasFaq;
}

export function applySynergyBonus(
  categories: Record<CategoryKey, CategoryScoreInternal>,
  evidence: Evidence,
): SynergyResult {
  const schema = categories.schema;
  const crawler = categories.crawler;
  const content = categories.content;
  const brand = categories.brand;
  const tech = categories.tech;

  const primaryGate =
    content.score >= 12 &&
    brand.score >= 8 &&
    tech.score >= 7 &&
    crawler.score >= 15;

  if (primaryGate && isEliteTier(evidence, schema)) {
    const desired = 5;
    const applied = Math.min(
      desired,
      SYNERGY_HARD_CAP,
      schema.max - schema.score,
    );
    return makeResult(categories, applied, "elite",
      "Elite synergy: all category gates met + ≥3 schema types + sameAs + FAQPage");
  }

  if (primaryGate && hasMachineReadableSignal(evidence, schema)) {
    const applied = Math.min(
      3,
      SYNERGY_HARD_CAP,
      schema.max - schema.score,
    );
    return makeResult(categories, applied, "primary",
      "Primary synergy: all category gates met + ≥1 machine-readable signal");
  }

  const partialGate =
    content.score >= 10 &&
    brand.score >= 7 &&
    tech.score >= 6 &&
    crawler.score >= 14 &&
    schema.score >= 14;

  if (partialGate) {
    const applied = Math.min(
      1,
      SYNERGY_HARD_CAP,
      schema.max - schema.score,
    );
    return makeResult(categories, applied, "partial",
      "Partial synergy: most category gates met (relaxed thresholds)");
  }

  return {
    categories,
    applied: 0,
    tier: "none",
    reason: null,
  };
}

function makeResult(
  categories: Record<CategoryKey, CategoryScoreInternal>,
  applied: number,
  tier: SynergyResult["tier"],
  reason: string,
): SynergyResult {
  const schema = categories.schema;
  const newSchemaScore = Math.min(schema.score + applied, schema.max);
  const realApplied = newSchemaScore - schema.score;
  if (realApplied === 0) {
    return { categories, applied: 0, tier: "none", reason: null };
  }
  return {
    categories: {
      ...categories,
      schema: {
        ...schema,
        score: newSchemaScore,
        signals: [
          ...schema.signals,
          `Synergy bonus applied (+${realApplied}, ${tier})`,
        ],
      },
    },
    applied: realApplied,
    tier,
    reason,
  };
}
