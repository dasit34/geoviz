/**
 * Proof Engine v1 — improvement experiments and their outcomes.
 *
 * An experiment links a frozen baseline measurement to an ImprovementTask
 * (the action, target URL, approval, implementation date and independent
 * website verification all live on the task — not copied here) and, later,
 * a follow-up measurement. The outcome is decided by `assessExperiment`, a
 * pure, versioned function, in this order:
 *
 *   1. implementation_not_verified — not implemented, or the independent
 *      website check hasn't verified it.
 *   2. insufficient_evidence       — no follow-up measurement taken after
 *      implementation yet.
 *   3. measurement_not_comparable  — the question set, AI systems, sampling
 *      or measurement configuration changed (see compare.ts).
 *   4. insufficient_evidence       — fewer than MIN_COMPARABLE_SAMPLES
 *      comparable samples on either side.
 *   5. improvement_observed / decline_observed — the mention rate moved by at
 *      least MATERIAL_RATE_CHANGE AND by at least MATERIAL_MENTION_CHANGE
 *      mentions, in that direction.
 *   6. no_material_change          — otherwise.
 *
 * Language is deliberately non-causal: outcomes describe a change OBSERVED
 * AFTER implementation, never that the change caused it.
 */
import { compareMeasurements, type CycleSnapshot, type MeasurementComparison } from "./compare";

export const OUTCOME_VERSION = "proof-outcome@1.0.0";
export const MIN_COMPARABLE_SAMPLES = 8;
export const MATERIAL_RATE_CHANGE = 0.15;
export const MATERIAL_MENTION_CHANGE = 2;

export const EXPERIMENT_OUTCOMES = [
  "improvement_observed",
  "decline_observed",
  "no_material_change",
  "implementation_not_verified",
  "measurement_not_comparable",
  "insufficient_evidence",
] as const;
export type ExperimentOutcome = (typeof EXPERIMENT_OUTCOMES)[number];

/** Outcomes that are final once recorded; the others can be re-assessed later. */
export const FINAL_OUTCOMES: ReadonlySet<ExperimentOutcome> = new Set([
  "improvement_observed",
  "decline_observed",
  "no_material_change",
  "measurement_not_comparable",
]);

export const OUTCOME_LABELS: Record<ExperimentOutcome, string> = {
  improvement_observed: "Improvement observed after implementation",
  decline_observed: "Decline observed after implementation",
  no_material_change: "No material change observed",
  implementation_not_verified: "Implementation not verified",
  measurement_not_comparable: "Measurements not comparable",
  insufficient_evidence: "Insufficient evidence",
};

export const NO_CAUSATION_NOTE =
  "This describes what was measured after the change was implemented. It does not show that the change caused any difference — AI answers vary, and other things change over time.";

export type TaskForExperiment = {
  id: string;
  subscriptionId: string;
  status: string;
  title: string;
  proposedFix: string;
  url: string | null;
  implementationUrl: string | null;
  category: string;
  dedupeKey: string;
  evidence: unknown;
  approvedAt: Date | null;
  implementedAt: Date | null;
  verifiedAt: Date | null;
};

export type Decision = { ok: true } | { ok: false; reason: string };

export function decideCreateExperiment(args: {
  task: TaskForExperiment;
  activeSet: { id: string; version: number } | null;
  baselineCycle: Pick<CycleSnapshot, "id" | "status" | "questionSetId" | "questionSetVersion" | "startedAt"> | null;
  alreadyExists: boolean;
}): Decision {
  const { task, activeSet, baselineCycle } = args;
  if (args.alreadyExists) return { ok: false, reason: "This improvement task already has an experiment." };
  if (!task.approvedAt || task.status === "suggested" || task.status === "dismissed") {
    return { ok: false, reason: "The improvement must be approved before an experiment can start." };
  }
  if (!activeSet) return { ok: false, reason: "Activate an approved question set first — experiments need a fixed measurement baseline." };
  if (!baselineCycle) return { ok: false, reason: "No completed measurement of the active question set exists yet. Run a baseline measurement first." };
  if (baselineCycle.questionSetId !== activeSet.id || baselineCycle.questionSetVersion !== activeSet.version) {
    return { ok: false, reason: "The baseline measurement wasn't taken against the active question set." };
  }
  if (!["completed", "partial"].includes(baselineCycle.status)) return { ok: false, reason: "The baseline measurement hasn't finished." };
  if (task.implementedAt && baselineCycle.startedAt >= task.implementedAt) {
    return { ok: false, reason: "The baseline must be measured before the change was implemented." };
  }
  return { ok: true };
}

export type Assessment = {
  outcome: ExperimentOutcome;
  reason: string;
  summary: string;
  outcomeVersion: string;
  comparison: Omit<MeasurementComparison, "pairs"> | null;
  baselineCycleId: string;
  followUpCycleId: string | null;
  thresholds: { minComparableSamples: number; materialRateChange: number; materialMentionChange: number };
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function assessExperiment(args: {
  task: Pick<TaskForExperiment, "status" | "implementedAt" | "verifiedAt">;
  /** Latest independent website-verification outcome, if any. */
  verificationOutcome: string | null;
  baseline: CycleSnapshot;
  followUp: CycleSnapshot | null;
  customerDomain: string | null;
}): Assessment {
  const thresholds = { minComparableSamples: MIN_COMPARABLE_SAMPLES, materialRateChange: MATERIAL_RATE_CHANGE, materialMentionChange: MATERIAL_MENTION_CHANGE };
  const base = { outcomeVersion: OUTCOME_VERSION, baselineCycleId: args.baseline.id, followUpCycleId: args.followUp?.id ?? null, thresholds };
  const result = (outcome: ExperimentOutcome, reason: string, summary: string, comparison: MeasurementComparison | null): Assessment => {
    const { pairs: _pairs, ...rest } = comparison ?? ({ pairs: null } as unknown as MeasurementComparison);
    return { ...base, outcome, reason, summary: `${summary} ${NO_CAUSATION_NOTE}`, comparison: comparison ? rest : null };
  };

  const verified = args.task.status === "verified" && args.task.verifiedAt !== null;
  if (!args.task.implementedAt || !verified) {
    const why = !args.task.implementedAt
      ? "The change hasn't been marked as implemented."
      : `The independent website check hasn't verified the change${args.verificationOutcome ? ` (latest result: ${args.verificationOutcome.replace(/_/g, " ")})` : ""}.`;
    return result("implementation_not_verified", why, "Outcome can't be assessed until the change is implemented and independently verified on the website.", null);
  }
  const followUp = args.followUp;
  if (!followUp || followUp.startedAt <= args.task.implementedAt) {
    return result("insufficient_evidence", "No follow-up measurement has been taken since the change was implemented.", "Waiting for a follow-up measurement after implementation.", null);
  }
  const comparison = compareMeasurements(args.baseline, followUp, args.customerDomain);
  if (!comparison.comparable) {
    return result("measurement_not_comparable", `Not comparable: ${comparison.reasons.join("; ")}.`, "The follow-up measurement can't be compared like-for-like with the baseline.", comparison);
  }
  const minSamples = Math.min(comparison.comparableSamples.baseline, comparison.comparableSamples.followUp);
  if (minSamples < MIN_COMPARABLE_SAMPLES) {
    return result("insufficient_evidence", `Only ${minSamples} comparable answers were measured (at least ${MIN_COMPARABLE_SAMPLES} are needed on each side).`, "Too few comparable answers were measured to assess a change.", comparison);
  }
  const change = comparison.mentionRate.change ?? 0;
  const mentionDiff = comparison.mentions.followUp - comparison.mentions.baseline;
  const from = pct(comparison.mentionRate.baseline);
  const to = pct(comparison.mentionRate.followUp);
  if (change >= MATERIAL_RATE_CHANGE && mentionDiff >= MATERIAL_MENTION_CHANGE) {
    return result("improvement_observed", `Mention rate rose from ${from} to ${to} on comparable answers.`, `After the change was implemented and verified, the business was named in ${to} of comparable answers, up from ${from}.`, comparison);
  }
  if (change <= -MATERIAL_RATE_CHANGE && mentionDiff <= -MATERIAL_MENTION_CHANGE) {
    return result("decline_observed", `Mention rate fell from ${from} to ${to} on comparable answers.`, `After the change was implemented and verified, the business was named in ${to} of comparable answers, down from ${from}.`, comparison);
  }
  return result("no_material_change", `Mention rate moved from ${from} to ${to}, below the ${Math.round(MATERIAL_RATE_CHANGE * 100)}-point threshold.`, `After the change was implemented and verified, the mention rate on comparable answers was ${to} (baseline ${from}) — no material change.`, comparison);
}

/** May an assessment overwrite the currently recorded outcome? Final outcomes are frozen. */
export function canRecordAssessment(current: ExperimentOutcome | null): boolean {
  return current === null || !FINAL_OUTCOMES.has(current);
}

// ── Store ─────────────────────────────────────────────────────────────

export type ExperimentRecord = {
  id: string;
  subscriptionId: string;
  improvementTaskId: string;
  questionSetId: string;
  questionSetVersion: number;
  baselineCycleId: string;
  findingId: string;
  findingEvidence: unknown;
  expectedCategory: string;
  followUpCycleId: string | null;
  outcome: ExperimentOutcome | null;
  outcomeReason: string | null;
  outcomeVersion: string | null;
  assessment: unknown;
  assessedAt: Date | null;
  isFixture: boolean;
  createdAt: Date;
};

/** Every method is scoped by subscriptionId — another subscription's experiment is "not found". */
export interface ExperimentStore {
  list(subscriptionId: string): Promise<ExperimentRecord[]>;
  get(subscriptionId: string, id: string): Promise<ExperimentRecord | null>;
  findByTask(subscriptionId: string, improvementTaskId: string): Promise<ExperimentRecord | null>;
  create(data: Omit<ExperimentRecord, "id" | "createdAt" | "followUpCycleId" | "outcome" | "outcomeReason" | "outcomeVersion" | "assessment" | "assessedAt">, now: Date): Promise<ExperimentRecord>;
  /** Conditional: only writes while the stored outcome is null or non-final. */
  recordAssessment(subscriptionId: string, id: string, a: Assessment, now: Date): Promise<boolean>;
}
