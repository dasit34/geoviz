import { InlineProse } from "@/components/Prose";
import { SECTION_EYEBROWS } from "@/lib/report-sections";
import { stripMarkdownMarkers } from "@/lib/parse-report";

/**
 * AI Consensus Summary — report v2.
 *
 * Plain-English distillation of the cross-model consensus data.
 * Lives between the four-model grid and the existing
 * CrossModelIntelligence card (which carries the technical
 * Confidence Index / verdict strip).
 *
 * Reads from:
 *   - aiValidations.outputs[] — to count how many systems passed
 *     and infer which dimensions had agreement.
 *   - consensusIndex.agreement_metrics — to read the majority
 *     confidence labels per axis (category, service area,
 *     recommendation).
 *
 * Fail-soft: when aiValidations or consensusIndex is null/empty, or
 * fewer than 2 providers passed (preserving the N>=2 rule from the
 * Scoring Constitution), the section renders an "AI model analysis
 * unavailable for this audit." panel — the customer always sees
 * the heading + the explicit absence rather than a silent omission.
 *
 * The "Overall AI Recommendation Confidence" label is a CONFIDENCE
 * LABEL, not a score. It's derived from passed-count + majority
 * agreement. Never rewrites the deterministic GeoViz score and never
 * exposes the canonical consensus_confidence value as a score.
 */

type ValidatorOutputShape = {
  provider: string;
  status: string;
  category_confidence: string | null;
  service_area_confidence: string | null;
  recommendation_confidence: string | null;
};

type DimensionShape = {
  score?: number;
};

type ConsensusShape = {
  agreement_metrics?: {
    providers_passed?: number;
    providers_failed?: number;
    providers_unavailable?: number;
    category_confidence_majority?: string | null;
    service_area_confidence_majority?: string | null;
    recommendation_confidence_majority?: string | null;
    agreement_label?: string;
  };
  dimensions?: {
    business_identity?: DimensionShape;
    schema_quality?: DimensionShape;
    trust_signals?: DimensionShape;
    service_clarity?: DimensionShape;
    coverage_depth?: DimensionShape;
    recommendation_readiness?: DimensionShape;
  };
  bullets_raw?: ConsensusBulletsShape | null;
  bullets_polished?: ConsensusBulletsShape | null;
  model_agreement?: string;
};

type ConsensusBulletsShape = {
  agreed?: string[];
  uncertain?: string[];
  missing?: string[];
  barriers?: string[];
};

type ValidatorLayer = {
  outputs?: ValidatorOutputShape[];
} | null;

type ConfidenceLabel = "LOW" | "MODERATE" | "HIGH";

/**
 * Customer-facing recommendation-confidence label.
 *
 * Pre-2026-06 versions read only (passedCount, agreementLabel) and
 * could return HIGH on weak-signal audits where four providers all
 * AGREED the business had LOW recommendation_confidence. That confused
 * customers — agreement on a negative is not a positive signal. The
 * corrected cascade folds in:
 *   - recommendation_confidence_majority across the passed providers
 *   - the deterministic Trust Signals score (0..100)
 *   - the deterministic Recommendation Readiness score (0..100)
 *
 * Frozen-surface note: this is a PRESENTATION label only. It does not
 * touch any deterministic scoring weight, band threshold, ladder
 * anchor, or the canonical GeoViz score.
 */
function deriveOverallConfidence(
  passedCount: number,
  agreementLabel: string | undefined,
  recommendationMajority: "low" | "medium" | "high" | null,
  trustSignalsScore: number,
  recommendationReadinessScore: number,
): ConfidenceLabel {
  // Rule 1 — providers agree the business has weak recommendation
  // signal: always LOW, regardless of how tightly they cluster.
  if (recommendationMajority === "low") return "LOW";

  // Rule 2 — deterministic floor: critically weak Trust Signals or
  // Recommendation Readiness blocks any HIGH/MODERATE outcome.
  if (trustSignalsScore < 35 || recommendationReadinessScore < 30) {
    return "LOW";
  }

  // Rule 3 — HIGH requires every supporting signal.
  if (
    passedCount >= 3 &&
    agreementLabel === "Strong" &&
    recommendationMajority === "high" &&
    trustSignalsScore >= 70 &&
    recommendationReadinessScore >= 70
  ) {
    return "HIGH";
  }

  // Rule 4 — MODERATE on softer combinations.
  if (
    passedCount >= 2 &&
    (agreementLabel === "Strong" || agreementLabel === "Moderate") &&
    (recommendationMajority === "high" ||
      recommendationMajority === "medium") &&
    (trustSignalsScore >= 35 || recommendationReadinessScore >= 30)
  ) {
    return "MODERATE";
  }

  return "LOW";
}

function asConfidenceMajority(
  value: string | null | undefined,
): "low" | "medium" | "high" | null {
  if (value === "low" || value === "medium" || value === "high") return value;
  return null;
}

function asNonNegScore(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function confidenceToneClass(c: ConfidenceLabel): string {
  switch (c) {
    case "HIGH":
      return "text-severity-info";
    case "MODERATE":
      return "text-severity-warning";
    case "LOW":
      return "text-severity-critical";
  }
}

function countConfidence(
  outputs: ValidatorOutputShape[],
  axis:
    | "category_confidence"
    | "service_area_confidence"
    | "recommendation_confidence",
  level: "low" | "medium" | "high",
): number {
  return outputs.filter(
    (o) => o.status === "passed" && o[axis] === level,
  ).length;
}

function UnavailablePanel() {
  return (
    <section
      className="report-section-card mt-10"
      aria-label="AI consensus summary — unavailable"
    >
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.aiConsensusSummary}</p>
      </div>
      <h2 className="h2 mt-3">Where all the AI systems agree.</h2>
      <p className="muted mt-3 text-sm leading-relaxed">
        AI model analysis unavailable for this audit.
      </p>
    </section>
  );
}

export function ConsensusSummary({
  aiValidations,
  consensusIndex,
}: {
  aiValidations: unknown;
  consensusIndex: unknown;
}) {
  const layer = aiValidations as ValidatorLayer;
  const consensus = consensusIndex as ConsensusShape | null;
  if (!layer || !Array.isArray(layer.outputs) || layer.outputs.length === 0) {
    return <UnavailablePanel />;
  }
  if (!consensus || typeof consensus !== "object") {
    return <UnavailablePanel />;
  }
  const metrics = consensus.agreement_metrics ?? {};
  const passedOutputs = layer.outputs.filter((o) => o.status === "passed");
  const passedCount =
    typeof metrics.providers_passed === "number"
      ? metrics.providers_passed
      : passedOutputs.length;
  if (passedCount < 2) return <UnavailablePanel />;

  // Confidence label inputs — correctness fix lands here. Pull
  // deterministic dimension scores out of the existing consensusIndex
  // payload (already persisted, no schema change required) and the
  // recommendation-confidence majority across the passed providers.
  const trustSignalsScore = asNonNegScore(
    consensus.dimensions?.trust_signals?.score,
  );
  const recommendationReadinessScore = asNonNegScore(
    consensus.dimensions?.recommendation_readiness?.score,
  );
  const recommendationMajority = asConfidenceMajority(
    metrics.recommendation_confidence_majority,
  );

  const overall = deriveOverallConfidence(
    passedCount,
    metrics.agreement_label,
    recommendationMajority,
    trustSignalsScore,
    recommendationReadinessScore,
  );

  // Prefer LLM-polished bullets when the worker step succeeded; fall
  // back to the deterministic raw bullets; fall back further to the
  // legacy 3-line distillation when neither is present (older audits).
  const bullets = pickBullets(consensus.bullets_polished, consensus.bullets_raw);
  const groups: Array<{ label: string; items: string[] }> = bullets
    ? [
        { label: "All Systems Agreed", items: bullets.agreed ?? [] },
        {
          label: "Some Systems Were Uncertain About",
          items: bullets.uncertain ?? [],
        },
        { label: "Missing Across Most Systems", items: bullets.missing ?? [] },
        { label: "Recommendation Barriers", items: bullets.barriers ?? [] },
      ].filter((g) => g.items.length > 0)
    : [];

  const fallbackLines = bullets ? null : buildLegacyLines(
    layer.outputs,
    passedCount,
  );

  return (
    <section className="report-section-card mt-10" aria-label="AI consensus summary">
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.aiConsensusSummary}</p>
        <span className="pill">{passedCount} AI Systems</span>
      </div>
      <h2 className="h2 mt-3">Where all the AI systems agree.</h2>
      {groups.length > 0 ? (
        <div className="mt-5 space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                {g.label}
              </p>
              <ul className="mt-2 space-y-1.5">
                {g.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[13px] leading-relaxed text-white/80"
                  >
                    <span aria-hidden className="mt-[6px] text-white/30">
                      •
                    </span>
                    <span>
                      <InlineProse>{stripMarkdownMarkers(item)}</InlineProse>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : fallbackLines ? (
        <ul className="mt-5 space-y-2">
          {fallbackLines.map((line, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-[13px] leading-relaxed text-white/80"
            >
              <span aria-hidden className="mt-[6px] text-white/30">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/[0.05] pt-4">
        <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">
          Overall AI Recommendation Confidence
        </span>
        <span
          className={`mono-data text-sm font-semibold ${confidenceToneClass(overall)}`}
        >
          {overall}
        </span>
      </div>
      <p className="muted mt-3 text-[11px] leading-relaxed">
        Confidence label is a directional read of cross-model
        agreement combined with trust + recommendation-readiness
        signals. Not a separate score; the GeoViz score remains the
        canonical outcome.
      </p>
    </section>
  );
}

function pickBullets(
  polished: ConsensusBulletsShape | null | undefined,
  raw: ConsensusBulletsShape | null | undefined,
): ConsensusBulletsShape | null {
  const candidates = [polished, raw];
  for (const c of candidates) {
    if (!c) continue;
    const total =
      (c.agreed?.length ?? 0) +
      (c.uncertain?.length ?? 0) +
      (c.missing?.length ?? 0) +
      (c.barriers?.length ?? 0);
    if (total > 0) return c;
  }
  return null;
}

function buildLegacyLines(
  outputs: ValidatorOutputShape[],
  passedCount: number,
): string[] {
  // Preserves the pre-2026-06 three-line distillation for legacy
  // consensusIndex records that lack bullets_raw / bullets_polished.
  const lines: string[] = [];
  const idHigh = countConfidence(outputs, "category_confidence", "high");
  const idMed = countConfidence(outputs, "category_confidence", "medium");
  if (idHigh >= 2) {
    lines.push(
      `All ${idHigh} AI systems clearly identified the company as the business it is.`,
    );
  } else if (idHigh + idMed >= 2) {
    lines.push(
      `${idHigh + idMed} of ${passedCount} systems identified the company with reasonable confidence.`,
    );
  } else {
    lines.push(
      `Most AI systems struggled to confidently identify the company without more signal.`,
    );
  }

  const svcHigh = countConfidence(outputs, "service_area_confidence", "high");
  const svcMed = countConfidence(outputs, "service_area_confidence", "medium");
  if (svcHigh + svcMed >= 2) {
    lines.push(
      `${svcHigh + svcMed} of ${passedCount} systems understood the services and service area offered.`,
    );
  } else {
    lines.push(
      "Most AI systems could not reliably determine the services or service area offered.",
    );
  }

  const recLow = countConfidence(outputs, "recommendation_confidence", "low");
  if (recLow >= 2) {
    lines.push(
      `All ${passedCount} systems had difficulty verifying enough trust signal to actively recommend the business.`,
    );
  } else {
    lines.push(
      `Recommendation confidence varied across the ${passedCount} systems based on the trust signals available.`,
    );
  }

  return lines;
}
