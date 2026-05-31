import { SECTION_EYEBROWS } from "@/lib/report-sections";

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
  model_agreement?: string;
};

type ValidatorLayer = {
  outputs?: ValidatorOutputShape[];
} | null;

type ConfidenceLabel = "LOW" | "MODERATE" | "HIGH";

function deriveOverallConfidence(
  passedCount: number,
  agreementLabel: string | undefined,
): ConfidenceLabel {
  // HIGH only when N >= 3 passed AND agreement label is Strong.
  // MODERATE when N >= 2 passed and agreement is Moderate or better.
  // LOW otherwise.
  if (passedCount >= 3 && agreementLabel === "Strong") return "HIGH";
  if (
    passedCount >= 2 &&
    (agreementLabel === "Strong" || agreementLabel === "Moderate")
  ) {
    return "MODERATE";
  }
  return "LOW";
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

  // Build the three plain-English lines.
  const lines: string[] = [];

  // Line 1: business identity agreement.
  const idHigh = countConfidence(
    layer.outputs,
    "category_confidence",
    "high",
  );
  const idMed = countConfidence(
    layer.outputs,
    "category_confidence",
    "medium",
  );
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

  // Line 2: service understanding.
  const svcHigh = countConfidence(
    layer.outputs,
    "service_area_confidence",
    "high",
  );
  const svcMed = countConfidence(
    layer.outputs,
    "service_area_confidence",
    "medium",
  );
  if (svcHigh + svcMed >= 2) {
    lines.push(
      `${svcHigh + svcMed} of ${passedCount} systems understood the services and service area offered.`,
    );
  } else {
    lines.push(
      `Most AI systems could not reliably determine the services or service area offered.`,
    );
  }

  // Line 3: recommendation confidence — invert. If most are low, call
  // out the gap.
  const recLow = countConfidence(
    layer.outputs,
    "recommendation_confidence",
    "low",
  );
  if (recLow >= 2) {
    lines.push(
      `All ${passedCount} systems had difficulty verifying enough trust signal to actively recommend the business.`,
    );
  } else {
    lines.push(
      `Recommendation confidence varied across the ${passedCount} systems based on the trust signals available.`,
    );
  }

  const overall = deriveOverallConfidence(
    passedCount,
    metrics.agreement_label,
  );

  return (
    <section className="report-section-card mt-10" aria-label="AI consensus summary">
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.aiConsensusSummary}</p>
        <span className="pill">{passedCount} systems</span>
      </div>
      <h2 className="h2 mt-3">Where all the AI systems agree.</h2>
      <ul className="mt-5 space-y-2">
        {lines.map((line, i) => (
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
        Confidence label is a directional read of cross-model agreement,
        not a separate score. The GeoViz score remains the canonical
        outcome.
      </p>
    </section>
  );
}
