/**
 * Customer-facing confidence framing.
 *
 * Maps the deterministic engine's `confidence_level` to a
 * three-bucket customer label + a single-sentence reason sourced
 * from the weakest `confidence_inputs` value. NO LLM, NO speculation,
 * NO probabilistic math.
 *
 * The engine output (`DeterministicScore.confidence_level / score /
 * inputs`) is already populated on every audit by
 * `src/lib/scoring/confidence.ts`. This module only formats it for
 * customer-visible surfaces (ReportScoreCard, sample-report,
 * ScoringExamplePanel).
 *
 * Pure. Same input → same output. Never throws.
 */
import type {
  ConfidenceInputs,
  ConfidenceLevel,
  DeterministicScore,
} from "@/lib/scoring/types";

export type CustomerConfidenceLabel =
  | "High confidence"
  | "Moderate confidence"
  | "Limited confidence";

export type CustomerConfidenceFraming = {
  label: CustomerConfidenceLabel;
  /** Single-sentence reason citing the weakest confidence input. */
  reason: string;
};

function labelFor(level: ConfidenceLevel): CustomerConfidenceLabel {
  switch (level) {
    case "high":
      return "High confidence";
    case "moderate":
      return "Moderate confidence";
    case "low":
    default:
      return "Limited confidence";
  }
}

const REASON_TEMPLATE: Record<keyof ConfidenceInputs, string> = {
  evidence_completeness: "Limited audit-pipeline completeness.",
  preflight_success: "Initial site fetch was partial.",
  schema_certainty: "Schema markup partially detected.",
  // Launch Blocker P1 #5 — avoid the "fi" ligature which Chromium's
  // Puppeteer renderer can drop in PDF output. Using "confirmed"
  // carries the same meaning without triggering the ligature.
  entity_certainty: "Business identity weakly confirmed across surfaces.",
  content_extraction_quality: "Some site content was difficult to extract.",
  render_coverage: "Headless render did not cover all pages.",
};

const FULL_COMPLETION_THRESHOLD = 80;
const ALL_FULL_REASON = "Full audit pipeline completed.";

/**
 * Pick the lowest input and return its templated reason. When every
 * input is ≥80, returns the "Full audit pipeline completed." line.
 */
function reasonFor(inputs: ConfidenceInputs): string {
  const entries = Object.entries(inputs) as Array<[keyof ConfidenceInputs, number]>;
  let worst: { key: keyof ConfidenceInputs; value: number } | null = null;
  for (const [key, value] of entries) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (!worst || value < worst.value) {
      worst = { key, value };
    }
  }
  if (!worst || worst.value >= FULL_COMPLETION_THRESHOLD) {
    return ALL_FULL_REASON;
  }
  return REASON_TEMPLATE[worst.key];
}

export function formatCustomerConfidence(
  score: Pick<DeterministicScore, "confidence_level" | "confidence_inputs">,
): CustomerConfidenceFraming {
  return {
    label: labelFor(score.confidence_level),
    reason: reasonFor(score.confidence_inputs),
  };
}
