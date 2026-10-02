/**
 * Before/after AI-answer measurements around a task's implementation date
 * (pure). Uses the tracking comparison rules: only (question, AI system)
 * pairs measured under the same configuration in both runs are compared.
 * Describes what was measured — never claims the change caused it.
 */
import { compareCycles, computeCycleMetrics } from "../tracking/metrics";
import type { CompetitorRef, ResultForMetrics } from "../tracking/types";

export const IMPACT_DISCLAIMER = "Measured after your change was implemented. This doesn't show that the change caused any difference — AI answers vary, and many other things change over time.";

export type CycleForImpact = { id: string; startedAt: Date; results: ResultForMetrics[] };

export type MeasurementSummary = { cycleId: string; at: Date; mentionRate: number | null; citationRate: number | null; measured: number; answers: number; coverage: number | null };

export type ImpactView =
  | { state: "not_implemented" }
  | { state: "awaiting"; before: MeasurementSummary | null }
  | {
      state: "measured";
      before: MeasurementSummary | null;
      after: MeasurementSummary;
      comparable: boolean;
      comparablePairs: number;
      reason: string | null;
      mentionChange: number | null;
      citationChange: number | null;
      question: { before: { named: number; measured: number } | null; after: { named: number; measured: number } } | null;
    };

function summarize(c: CycleForImpact, customerDomain: string | null, competitors: CompetitorRef[]): MeasurementSummary {
  const m = computeCycleMetrics(c.results, customerDomain, competitors);
  return { cycleId: c.id, at: c.startedAt, mentionRate: m.mentionRate, citationRate: m.citationRate, measured: m.measured, answers: m.answers, coverage: m.coverage };
}

function questionStat(results: ResultForMetrics[], promptId: string) {
  const measured = results.filter((r) => r.trackedPromptId === promptId && r.status === "measured");
  return { named: measured.filter((r) => r.mentioned === true).length, measured: measured.length };
}

export function buildImpact(args: {
  implementedAt: Date | null;
  cycles: CycleForImpact[];
  customerDomain: string | null;
  competitors: CompetitorRef[];
  trackedPromptId?: string | null;
}): ImpactView {
  if (!args.implementedAt) return { state: "not_implemented" };
  const t = args.implementedAt.getTime();
  const sorted = [...args.cycles].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const beforeCycle = sorted.filter((c) => c.startedAt.getTime() < t).pop() ?? null;
  const afterCycle = sorted.find((c) => c.startedAt.getTime() > t) ?? null;
  const before = beforeCycle ? summarize(beforeCycle, args.customerDomain, args.competitors) : null;
  if (!afterCycle) return { state: "awaiting", before };
  const after = summarize(afterCycle, args.customerDomain, args.competitors);
  const cmp = beforeCycle ? compareCycles(beforeCycle.results, afterCycle.results, args.customerDomain, args.competitors) : null;
  const q = args.trackedPromptId
    ? { before: beforeCycle ? questionStat(beforeCycle.results, args.trackedPromptId) : null, after: questionStat(afterCycle.results, args.trackedPromptId) }
    : null;
  return {
    state: "measured",
    before,
    after,
    comparable: cmp?.comparable ?? false,
    comparablePairs: cmp?.comparablePairs ?? 0,
    reason: cmp ? cmp.reason : "No measurement from before the change to compare with.",
    mentionChange: cmp?.comparable ? cmp.mentionRate.change : null,
    citationChange: cmp?.comparable ? cmp.citationRate.change : null,
    question: q,
  };
}
