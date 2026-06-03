/**
 * Phase D — shared report-context builder.
 *
 * Lifted from `src/app/report/[id]/print/page.tsx` so the customer-
 * facing PDF route AND the admin queue both build the SAME context
 * payload that `<AuditReportContent />` consumes. Pre-Phase D, the
 * admin used `<ReportViewerClient />` which was a parallel
 * re-implementation that omitted percentile / confidence /
 * four-model / consensus surfaces — so operators couldn't review
 * what customers received.
 *
 * Pure. Fail-soft. Never throws — returns `undefined` on any error
 * path so the caller's report still renders unchanged.
 */
import {
  getAuditPercentileBundle,
  type AuditScoreSnapshot,
} from "@/lib/intelligence/audit-percentile";
import { formatCustomerConfidence } from "@/lib/intelligence/confidence-display";
import type { AuditReportContext } from "@/components/AuditReportContent";
import type { DeterministicScore } from "@/lib/scoring/types";

/**
 * Shape of the `AuditIntelligence` row this builder reads. The
 * caller is responsible for passing exactly these fields through
 * Prisma's `select` clause (PDF route + admin/reports page now do
 * this identically).
 */
export type ReportContextIntelligenceInput = {
  deterministicScore: unknown;
  industryCategoryNormalized: string | null;
  overallScore: number | null;
  semanticClarityScore: number | null;
  crawlerAccessibilityScore: number | null;
  trustSignalScore: number | null;
  structuredIdentityScore: number | null;
  recommendationReadinessScore: number | null;
  aiValidations?: unknown;
  consensusIndex?: unknown;
  preflightSignals?: unknown;
} | null;

export async function buildReportContext(
  intelligence: ReportContextIntelligenceInput,
): Promise<AuditReportContext | undefined> {
  if (!intelligence) return undefined;
  if (intelligence.overallScore === null) return undefined;
  try {
    const snapshot: AuditScoreSnapshot = {
      industrySlug: intelligence.industryCategoryNormalized,
      overallScore: intelligence.overallScore,
      semanticClarityScore: intelligence.semanticClarityScore,
      crawlerAccessibilityScore: intelligence.crawlerAccessibilityScore,
      trustSignalScore: intelligence.trustSignalScore,
      structuredIdentityScore: intelligence.structuredIdentityScore,
      recommendationReadinessScore:
        intelligence.recommendationReadinessScore,
    };
    const bundle = await getAuditPercentileBundle(snapshot);

    const cohortCellValue =
      bundle.overall.bucket === "insufficient"
        ? "Industry benchmark forming"
        : `${bundle.overall.bucket}${
            intelligence.industryCategoryNormalized
              ? ` (${intelligence.industryCategoryNormalized})`
              : ""
          }`;

    let confidenceLabel: string | null = null;
    let confidenceReason: string | null = null;
    const deterministic = intelligence.deterministicScore as
      | DeterministicScore
      | null;
    if (
      deterministic &&
      typeof deterministic === "object" &&
      "confidence_level" in deterministic &&
      "confidence_inputs" in deterministic
    ) {
      const framing = formatCustomerConfidence(deterministic);
      confidenceLabel = framing.label;
      confidenceReason = framing.reason;
    }

    return {
      percentileCopy: bundle.overall.copy,
      cohortCellValue,
      confidenceLabel,
      confidenceReason,
      weakestCategoryCopy: bundle.weakestCategory?.data.copy ?? null,
      aiValidations: intelligence.aiValidations ?? null,
      consensusIndex: intelligence.consensusIndex ?? null,
      preflightSignals: intelligence.preflightSignals ?? null,
    };
  } catch (err) {
    console.error(
      "[build-report-context] failed:",
      (err as Error).message?.slice(0, 200),
    );
    return undefined;
  }
}
