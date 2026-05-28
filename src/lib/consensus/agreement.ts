/**
 * Cross-model agreement math. Pure function over validator outputs.
 *
 * Gates:
 *   - Counts providers by status. If < 2 returned `status: "passed"`,
 *     returns `agreement_label: "Insufficient"` plus null numeric/
 *     majority fields. The Stage-2 UI suppresses the cross-model card
 *     when consensus_confidence is "Insufficient".
 *
 * Variance-to-label thresholds (stdev of `business_understanding_score`
 * across passed providers):
 *   stdev <= 10  → "Strong"      (tight clustering)
 *   stdev <= 20  → "Moderate"    (some spread)
 *   stdev > 20   → "Divergent"   (models disagree materially)
 *
 * Majority math for the three confidence axes (category /
 * service_area / recommendation): count low/medium/high across passed
 * providers; pick the mode; ties favor the higher level.
 */

import type {
  ConfidenceLevel,
  NormalizedValidationOutput,
  ValidationLayerResult,
} from "@/lib/validators/types";

import type { AgreementLabel, AgreementMetrics } from "./types";

export const PASSED_PROVIDERS_MIN = 2;
const STDEV_STRONG = 10;
const STDEV_MODERATE = 20;

type ConfidenceAxis =
  | "category_confidence"
  | "service_area_confidence"
  | "recommendation_confidence";

function majorityConfidence(
  passed: NormalizedValidationOutput[],
  axis: ConfidenceAxis,
): "low" | "medium" | "high" | null {
  let low = 0;
  let medium = 0;
  let high = 0;
  for (const o of passed) {
    const v = o[axis] as ConfidenceLevel;
    if (v === "low") low += 1;
    else if (v === "medium") medium += 1;
    else if (v === "high") high += 1;
  }
  // Ties favor the higher level (high > medium > low).
  if (high >= medium && high >= low && high > 0) return "high";
  if (medium >= low && medium > 0) return "medium";
  if (low > 0) return "low";
  return null;
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function labelFromStdev(s: number): AgreementLabel {
  if (s <= STDEV_STRONG) return "Strong";
  if (s <= STDEV_MODERATE) return "Moderate";
  return "Divergent";
}

export function computeAgreement(
  result: ValidationLayerResult | null,
): AgreementMetrics {
  const outputs = result?.outputs ?? [];
  const passed = outputs.filter((o) => o.status === "passed");
  const failed = outputs.filter((o) => o.status === "failed").length;
  const unavailable = outputs.filter((o) => o.status === "unavailable").length;

  if (passed.length < PASSED_PROVIDERS_MIN) {
    return {
      providers_passed: passed.length,
      providers_failed: failed,
      providers_unavailable: unavailable,
      business_understanding_stdev: null,
      category_confidence_majority: null,
      service_area_confidence_majority: null,
      recommendation_confidence_majority: null,
      agreement_label: "Insufficient",
    };
  }

  // Stdev of business_understanding_score across passed providers
  // (only numeric values participate; null/undefined excluded).
  const scores: number[] = [];
  for (const o of passed) {
    const v = o.business_understanding_score;
    if (typeof v === "number" && Number.isFinite(v)) scores.push(v);
  }
  // Round stdev to 2 decimal places for stable JSON.
  const stdevValue =
    scores.length >= PASSED_PROVIDERS_MIN
      ? Number(stdev(scores).toFixed(2))
      : null;

  return {
    providers_passed: passed.length,
    providers_failed: failed,
    providers_unavailable: unavailable,
    business_understanding_stdev: stdevValue,
    category_confidence_majority: majorityConfidence(passed, "category_confidence"),
    service_area_confidence_majority: majorityConfidence(passed, "service_area_confidence"),
    recommendation_confidence_majority: majorityConfidence(passed, "recommendation_confidence"),
    agreement_label:
      stdevValue === null ? "Insufficient" : labelFromStdev(stdevValue),
  };
}
