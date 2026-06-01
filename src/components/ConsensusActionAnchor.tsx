/**
 * Report Polish P6 — Foundation Fix nudge anchored to the moment
 * the consensus reveals LOW or MODERATE recommendation confidence.
 *
 * Pure presentation. Re-derives the same confidence label as
 * ConsensusSummary (using the same persisted consensusIndex data)
 * so the conditional render stays in sync without prop-drilling
 * the value from the sibling component.
 *
 * Renders nothing on HIGH confidence reports; the existing
 * Section 05 Foundation Fix CTA at the end of the report carries
 * the formal pitch in those cases.
 */

type ValidatorOutputShape = {
  status: string;
  recommendation_confidence?: string | null;
};

type ValidatorLayer = {
  outputs?: ValidatorOutputShape[];
} | null;

type ConsensusShape = {
  agreement_metrics?: {
    providers_passed?: number;
    recommendation_confidence_majority?: string | null;
    agreement_label?: string;
  };
  dimensions?: {
    trust_signals?: { score?: number };
    recommendation_readiness?: { score?: number };
  };
};

function asScore(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
}

function asMajority(
  v: string | null | undefined,
): "low" | "medium" | "high" | null {
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

type ConfidenceLabel = "LOW" | "MODERATE" | "HIGH";

function deriveLabel(
  passedCount: number,
  agreementLabel: string | undefined,
  recommendationMajority: "low" | "medium" | "high" | null,
  trustSignalsScore: number,
  recommendationReadinessScore: number,
): ConfidenceLabel {
  if (recommendationMajority === "low") return "LOW";
  if (trustSignalsScore < 35 || recommendationReadinessScore < 30) return "LOW";
  if (
    passedCount >= 3 &&
    agreementLabel === "Strong" &&
    recommendationMajority === "high" &&
    trustSignalsScore >= 70 &&
    recommendationReadinessScore >= 70
  ) {
    return "HIGH";
  }
  if (
    passedCount >= 2 &&
    (agreementLabel === "Strong" || agreementLabel === "Moderate") &&
    (recommendationMajority === "high" || recommendationMajority === "medium") &&
    (trustSignalsScore >= 35 || recommendationReadinessScore >= 30)
  ) {
    return "MODERATE";
  }
  return "LOW";
}

export function ConsensusActionAnchor({
  aiValidations,
  consensusIndex,
  businessName,
}: {
  aiValidations: unknown;
  consensusIndex: unknown;
  businessName?: string;
}) {
  const layer = aiValidations as ValidatorLayer;
  const consensus = consensusIndex as ConsensusShape | null;
  if (!layer || !Array.isArray(layer.outputs)) return null;
  if (!consensus || typeof consensus !== "object") return null;

  const metrics = consensus.agreement_metrics ?? {};
  const passedCount =
    typeof metrics.providers_passed === "number"
      ? metrics.providers_passed
      : layer.outputs.filter((o) => o.status === "passed").length;
  if (passedCount < 2) return null;

  const label = deriveLabel(
    passedCount,
    metrics.agreement_label,
    asMajority(metrics.recommendation_confidence_majority),
    asScore(consensus.dimensions?.trust_signals?.score),
    asScore(consensus.dimensions?.recommendation_readiness?.score),
  );
  if (label === "HIGH") return null;

  const name = businessName?.trim() || "your business";
  const lead =
    label === "LOW"
      ? `AI systems lack confidence in recommending ${name} today.`
      : `AI systems would partially recommend ${name} — there's a clear path to a stronger signal.`;

  return (
    <aside
      className="mt-8 rounded-md border border-accent/30 bg-accent/[0.06] px-5 py-4"
      aria-label="Foundation Fix action prompt"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
        Next step
      </p>
      <h3 className="h3 mt-2">Need help fixing these issues?</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-white/80">
        {lead} Our Foundation Fix service implements the improvements
        identified in this audit — machine-readable business info,
        trust signals, and AI-readable service detail — so AI systems
        can confidently recommend {name}.
      </p>
      <p className="mt-3 text-[12px] text-accent">
        See the Foundation Fix plan below in Section 05 →
      </p>
    </aside>
  );
}
