/**
 * Deterministic confidence formula — produces a 0..100 score + a
 * bucket label + the sub-scores that fed the calculation.
 *
 * Confidence reflects how complete the evidence was, not how good
 * the score is. A weak site with complete evidence is high
 * confidence (we're sure it scored low). A strong site with most
 * analyzers failing is low confidence (we may be underestimating).
 *
 * Weighted average — total weight = 1.00:
 *   evidence_completeness        25%
 *   preflight_success            15%
 *   schema_certainty             15%
 *   entity_certainty             15%
 *   content_extraction_quality   15%
 *   render_coverage              15%
 *
 * Bands:
 *   high     ≥ 85
 *   moderate 65..84
 *   low      < 65
 *
 * Pure — same evidence ⇒ same score every time.
 */

import type {
  ConfidenceInputs,
  ConfidenceLevel,
  ConfidenceScore,
  Evidence,
} from "./types";

const WEIGHT = {
  evidence_completeness: 0.25,
  preflight_success: 0.15,
  schema_certainty: 0.15,
  entity_certainty: 0.15,
  content_extraction_quality: 0.15,
  render_coverage: 0.15,
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function bandFromScore(score: number): ConfidenceLevel {
  if (score >= 85) return "high";
  if (score >= 65) return "moderate";
  return "low";
}

export function computeConfidence(evidence: Evidence): ConfidenceScore {
  // 1. Evidence completeness — count populated analyzers.
  let analyzersOk = 0;
  if (evidence.meta.schema_validated) analyzersOk += 1;
  if (evidence.meta.crawlability_audited) analyzersOk += 1;
  if (evidence.meta.entity_checked) analyzersOk += 1;
  if (evidence.meta.readable_content_extracted) analyzersOk += 1;
  const evidence_completeness = clampPct((analyzersOk / 4) * 100);

  // 2. Preflight success — binary (fetch + preflight orchestrator).
  const preflight_success =
    evidence.meta.preflight_ok && evidence.fetch_ok ? 100 : 0;

  // 3. Schema certainty — preflight analyzer score.
  const schema_certainty =
    typeof evidence.schema?.analyzer_score === "number"
      ? clampPct(evidence.schema.analyzer_score)
      : 0;

  // 4. Entity certainty — surface agreement.
  const entity_certainty =
    typeof evidence.entity?.surface_agreement === "number"
      ? clampPct(evidence.entity.surface_agreement * 100)
      : 0;

  // 5. Content extraction quality.
  let content_extraction_quality = 0;
  if (evidence.content) {
    if (evidence.content.parsed_by_readability === true) {
      content_extraction_quality = 100;
    } else if (evidence.content.fallback_used === true) {
      content_extraction_quality = 40;
    } else {
      content_extraction_quality = 0;
    }
  }

  // 6. Render coverage. Render is optional — when not eligible, count
  // as 50 (neutral) rather than 0 so a site that didn't need rendering
  // isn't penalized.
  let render_coverage = 50;
  if (evidence.render?.attempted === true) {
    render_coverage = evidence.render.successful === true ? 100 : 50;
  }

  const inputs: ConfidenceInputs = {
    evidence_completeness,
    preflight_success,
    schema_certainty,
    entity_certainty,
    content_extraction_quality,
    render_coverage,
  };

  const score = clampPct(
    inputs.evidence_completeness * WEIGHT.evidence_completeness +
      inputs.preflight_success * WEIGHT.preflight_success +
      inputs.schema_certainty * WEIGHT.schema_certainty +
      inputs.entity_certainty * WEIGHT.entity_certainty +
      inputs.content_extraction_quality * WEIGHT.content_extraction_quality +
      inputs.render_coverage * WEIGHT.render_coverage,
  );

  return {
    score,
    level: bandFromScore(score),
    inputs,
  };
}
