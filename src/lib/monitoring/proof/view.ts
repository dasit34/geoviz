/**
 * Proof Engine v1 — the before/after proof view for one experiment.
 *
 * Pure: assembles what the dashboard shows from stored records. Uses the
 * RECORDED assessment when one exists; otherwise computes a provisional one
 * (clearly labelled) without writing anything.
 */
import { assessExperiment, NO_CAUSATION_NOTE, OUTCOME_LABELS, type Assessment, type ExperimentRecord, type TaskForExperiment } from "./experiment";
import type { CycleSnapshot, RateDelta } from "./compare";

export type ScorePoint = { score: number; at: Date } | null;
export type WebsiteEvidence = {
  verification: { outcome: string | null; checkedAt: Date | null; url: string | null; expected: unknown; observed: unknown } | null;
  changes: Array<{ changeType: string; url: string; beforeExcerpt: string | null; afterExcerpt: string | null; detectedAt: Date }>;
};

export type ProofView = {
  experimentId: string;
  action: { title: string; proposedFix: string; targetUrl: string | null; implementationUrl: string | null; expectedCategory: string };
  dates: { approvedAt: Date | null; implementedAt: Date | null; verifiedAt: Date | null; baselineAt: Date; followUpAt: Date | null };
  questionSet: { id: string; version: number };
  score: { baseline: ScorePoint; followUp: ScorePoint; note: string };
  mentionRate: RateDelta;
  competitorShare: RateDelta & { comparable: boolean; reason: string | null };
  citations: { gained: string[]; lost: string[]; kept: string[] };
  website: WebsiteEvidence;
  comparable: boolean;
  comparabilityReasons: string[];
  outcome: { state: string; label: string; reason: string; summary: string; recorded: boolean; assessedAt: Date | null; version: string };
  finding: { id: string; evidence: unknown };
  noCausationNote: string;
};

const none: RateDelta = { baseline: null, followUp: null, change: null };

export function buildProofView(args: {
  experiment: ExperimentRecord;
  task: TaskForExperiment;
  verificationOutcome: string | null;
  baseline: CycleSnapshot;
  followUp: CycleSnapshot | null;
  customerDomain: string | null;
  auditScores: { baseline: ScorePoint; followUp: ScorePoint };
  website: WebsiteEvidence;
}): ProofView {
  const recorded = args.experiment.outcome !== null && args.experiment.assessment !== null;
  const assessment: Assessment = recorded
    ? (args.experiment.assessment as Assessment)
    : assessExperiment({ task: args.task, verificationOutcome: args.verificationOutcome, baseline: args.baseline, followUp: args.followUp, customerDomain: args.customerDomain });
  const c = assessment.comparison;
  return {
    experimentId: args.experiment.id,
    action: {
      title: args.task.title,
      proposedFix: args.task.proposedFix,
      targetUrl: args.task.url,
      implementationUrl: args.task.implementationUrl,
      expectedCategory: args.experiment.expectedCategory,
    },
    dates: {
      approvedAt: args.task.approvedAt,
      implementedAt: args.task.implementedAt,
      verifiedAt: args.task.verifiedAt,
      baselineAt: args.baseline.startedAt,
      followUpAt: args.followUp?.startedAt ?? null,
    },
    questionSet: { id: args.experiment.questionSetId, version: args.experiment.questionSetVersion },
    score: {
      baseline: args.auditScores.baseline,
      followUp: args.auditScores.followUp,
      note: "GeoViz audit score from the nearest reviewed audit before and after implementation. It is a separate measure from the AI answer results below.",
    },
    mentionRate: c?.mentionRate ?? none,
    competitorShare: { ...(c?.competitorShare ?? none), comparable: c?.competitorShareComparable ?? false, reason: c?.competitorShareReason ?? "not measured yet" },
    citations: c?.citationDomains ?? { gained: [], lost: [], kept: [] },
    website: args.website,
    comparable: c?.comparable ?? false,
    comparabilityReasons: c?.reasons ?? [],
    outcome: {
      state: assessment.outcome,
      label: OUTCOME_LABELS[assessment.outcome],
      reason: assessment.reason,
      summary: assessment.summary,
      recorded,
      assessedAt: args.experiment.assessedAt,
      version: assessment.outcomeVersion,
    },
    finding: { id: args.experiment.findingId, evidence: args.experiment.findingEvidence },
    noCausationNote: NO_CAUSATION_NOTE,
  };
}
