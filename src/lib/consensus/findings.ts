/**
 * Derive customer-facing bullets for the Stage-2 UI sections:
 *   - Strong Signals: dimensions performing at "Strong" tier or higher.
 *   - Visibility Gaps: dimensions below "Competitive" tier.
 *   - Immediate Actions: top recommended fixes from the deterministic
 *     engine, augmented (if N≥2 providers passed) with cross-model
 *     missing-fact themes mentioned by ≥2 providers.
 *
 * Pure deterministic + pure aggregation over validator outputs. No
 * LLM call. No string-fuzzy-match.
 */

import type { DeterministicScore } from "@/lib/scoring/types";
import type { NormalizedValidationOutput } from "@/lib/validators/types";

import type { Dimensions } from "./types";

const STRONG_THRESHOLD = 75;
const GAP_THRESHOLD = 60;
const MAX_BULLETS = 5;
const MAX_ACTIONS = 5;
const MIN_PROVIDERS_FOR_CROSS_MODEL_THEMES = 2;

/** Convert dimension key (snake_case) into a display label. Used only
 *  to format the deterministic bullet strings; no UI logic here. */
function humanLabel(key: keyof Dimensions): string {
  switch (key) {
    case "business_identity":
      return "Business Identity";
    case "schema_quality":
      return "Schema Quality";
    case "trust_signals":
      return "Trust Signals";
    case "service_clarity":
      return "Service Clarity";
    case "coverage_depth":
      return "Coverage Depth";
    case "recommendation_readiness":
      return "Recommendation Readiness";
  }
}

const DIMENSION_KEYS: ReadonlyArray<keyof Dimensions> = [
  "business_identity",
  "schema_quality",
  "trust_signals",
  "service_clarity",
  "coverage_depth",
  "recommendation_readiness",
];

/** Normalize a missing-fact string for cross-provider theme matching.
 *  Lowercase + collapse whitespace + drop trailing punctuation. */
function normalizeFact(fact: string): string {
  return fact.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/g, "");
}

function commonMissingFactsAcrossProviders(
  validatorOutputs: NormalizedValidationOutput[],
): string[] {
  const passed = validatorOutputs.filter((o) => o.status === "passed");
  if (passed.length < MIN_PROVIDERS_FOR_CROSS_MODEL_THEMES) return [];

  // Bucket by normalized key, preserve the first-seen display form,
  // count distinct providers per key.
  const display = new Map<string, string>();
  const providersPerKey = new Map<string, Set<string>>();
  for (const o of passed) {
    for (const fact of o.missing_facts) {
      const key = normalizeFact(fact);
      if (!key) continue;
      if (!display.has(key)) display.set(key, fact);
      const set = providersPerKey.get(key) ?? new Set<string>();
      set.add(o.provider);
      providersPerKey.set(key, set);
    }
  }

  // Surface only themes mentioned by ≥2 providers. Sort by count desc,
  // then by display string for stable output.
  return Array.from(providersPerKey.entries())
    .filter(([, providers]) => providers.size >= MIN_PROVIDERS_FOR_CROSS_MODEL_THEMES)
    .sort((a, b) => {
      const diff = b[1].size - a[1].size;
      if (diff !== 0) return diff;
      const aDisplay = display.get(a[0]) ?? "";
      const bDisplay = display.get(b[0]) ?? "";
      return aDisplay.localeCompare(bDisplay);
    })
    .map(([key]) => display.get(key) ?? key);
}

export function deriveFindings(input: {
  deterministicScore: DeterministicScore;
  dimensions: Dimensions;
  validatorOutputs: NormalizedValidationOutput[];
}): {
  strong_signals: string[];
  visibility_gaps: string[];
  immediate_actions: string[];
} {
  const { deterministicScore, dimensions, validatorOutputs } = input;

  // Strong Signals: dimensions at Strong tier or above (score >= 75).
  // Sort descending by score for stable ordering.
  const strongSignals: string[] = DIMENSION_KEYS.filter(
    (key) => dimensions[key].score >= STRONG_THRESHOLD,
  )
    .sort((a, b) => dimensions[b].score - dimensions[a].score)
    .map(
      (key) =>
        `${humanLabel(key)} strong (${dimensions[key].score}/100, ${dimensions[key].level})`,
    )
    .slice(0, MAX_BULLETS);

  // Visibility Gaps: dimensions below Competitive (score < 60).
  // Sort ascending by score so the worst gaps surface first.
  const visibilityGaps: string[] = DIMENSION_KEYS.filter(
    (key) => dimensions[key].score < GAP_THRESHOLD,
  )
    .sort((a, b) => dimensions[a].score - dimensions[b].score)
    .map(
      (key) =>
        `${humanLabel(key)} below competitive (${dimensions[key].score}/100, ${dimensions[key].level})`,
    )
    .slice(0, MAX_BULLETS);

  // Immediate Actions: deterministic top fixes (purely deterministic) +
  // cross-model missing-fact themes (when N≥2 passed providers agree).
  const deterministicActions = (deterministicScore.top_3_recommended_fixes ?? [])
    .slice(0, 3)
    .map((fix) => fix.action);
  const crossModelThemes = commonMissingFactsAcrossProviders(validatorOutputs);
  const combined = [...deterministicActions];
  for (const theme of crossModelThemes) {
    if (combined.length >= MAX_ACTIONS) break;
    // Avoid surfacing an LLM theme that's already covered by a
    // deterministic action (substring match in either direction).
    const normalized = normalizeFact(theme);
    const alreadyCovered = combined.some(
      (existing) =>
        normalizeFact(existing).includes(normalized) ||
        normalized.includes(normalizeFact(existing)),
    );
    if (!alreadyCovered) {
      combined.push(`Cross-model concern: ${theme}`);
    }
  }

  return {
    strong_signals: strongSignals,
    visibility_gaps: visibilityGaps,
    immediate_actions: combined.slice(0, MAX_ACTIONS),
  };
}
