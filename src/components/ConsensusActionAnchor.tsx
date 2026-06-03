/**
 * Report Polish P6 — Foundation Fix nudge anchored to the moment
 * the consensus reveals LOW or MODERATE recommendation confidence.
 *
 * Pure presentation. Derives the confidence label from the same
 * persisted consensusIndex data as ConsensusSummary via the shared
 * `deriveConsensusConfidenceLabel` helper, so the conditional render
 * stays in sync with the sibling section by construction (one source
 * of truth, not two hand-synced copies).
 *
 * Renders nothing on HIGH confidence reports; the existing
 * Section 05 Foundation Fix CTA at the end of the report carries
 * the formal pitch in those cases.
 */

import {
  asNonNegativeScore,
  asRecommendationMajority,
  deriveConsensusConfidenceLabel,
} from "@/lib/intelligence/derive-consensus-label";

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

  const label = deriveConsensusConfidenceLabel(
    passedCount,
    metrics.agreement_label,
    asRecommendationMajority(metrics.recommendation_confidence_majority),
    asNonNegativeScore(consensus.dimensions?.trust_signals?.score),
    asNonNegativeScore(consensus.dimensions?.recommendation_readiness?.score),
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
        identified in this audit — business details AI tools can
        verify, trust signals, and clear service descriptions — so AI
        systems can confidently recommend {name}.
      </p>
      <p className="mt-3 text-[12px] text-accent">
        See the Foundation Fix plan below in Section 05 →
      </p>
    </aside>
  );
}
