/**
 * Proof Engine v1 — is a follow-up measurement comparable to the baseline?
 *
 * Builds on the existing per-pair comparison (compareCycles: only
 * question × AI-system pairs measured in BOTH cycles under the SAME
 * configuration fingerprint count). On top of that, two measurements are
 * NOT comparable when any material condition changed:
 *   - either cycle wasn't measured against a fixed question set, or the
 *     question-set id or version differs;
 *   - the AI systems measured differ;
 *   - the samples per question differ;
 *   - no question × AI-system pair shares a configuration.
 * Competitor share is reported as not comparable on its own when the tracked
 * competitor set changed (the other metrics can still compare).
 */
import { compareCycles, type CycleComparison } from "../tracking/metrics";
import type { CompetitorRef, ResultForMetrics } from "../tracking/types";

export type ProofResult = ResultForMetrics & {
  /** Domains of citations the PROVIDER returned (never URLs merely written in the answer). */
  nativeCitationDomains: string[];
};

export type CycleSnapshot = {
  id: string;
  startedAt: Date;
  status: string;
  questionSetId: string | null;
  questionSetVersion: number | null;
  providers: string[];
  samplesPerPrompt: number;
  competitors: CompetitorRef[];
  results: ProofResult[];
};

export type RateDelta = { baseline: number | null; followUp: number | null; change: number | null };

export type MeasurementComparison = {
  comparable: boolean;
  /** Every material difference found (empty when comparable). */
  reasons: string[];
  comparablePairs: number;
  comparableSamples: { baseline: number; followUp: number };
  pairs: CycleComparison;
  mentionRate: RateDelta;
  mentions: { baseline: number; followUp: number };
  competitorShareComparable: boolean;
  competitorShareReason: string | null;
  competitorShare: RateDelta;
  /** Provider-returned citation domains on comparable pairs. */
  citationDomains: { gained: string[]; lost: string[]; kept: string[] };
};

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
const rd = (baseline: number | null, followUp: number | null): RateDelta => ({
  baseline,
  followUp,
  change: baseline !== null && followUp !== null ? followUp - baseline : null,
});

export function compareMeasurements(baseline: CycleSnapshot, followUp: CycleSnapshot, customerDomain: string | null): MeasurementComparison {
  const reasons: string[] = [];
  if (baseline.questionSetId === null || followUp.questionSetId === null) {
    reasons.push("one of the measurements wasn't taken against a fixed question set");
  } else if (baseline.questionSetId !== followUp.questionSetId || baseline.questionSetVersion !== followUp.questionSetVersion) {
    reasons.push(`the question set changed (v${baseline.questionSetVersion ?? "?"} → v${followUp.questionSetVersion ?? "?"})`);
  }
  if (!sameSet(baseline.providers, followUp.providers)) reasons.push("a different set of AI systems was measured");
  if (baseline.samplesPerPrompt !== followUp.samplesPerPrompt) reasons.push("a different number of samples per question was taken");

  const competitorsChanged = !sameSet(baseline.competitors.map((c) => c.id), followUp.competitors.map((c) => c.id));
  const pairs = compareCycles(baseline.results, followUp.results, customerDomain, followUp.competitors);
  if (!pairs.comparable) reasons.push((pairs.reason ?? "no question was measured the same way in both runs").replace(/^Not comparable: /, "").replace(/\.$/, ""));

  // The pairs compareCycles found comparable.
  const keyOf = (r: ResultForMetrics) => `${r.trackedPromptId}::${r.provider}`;
  const incompatible = new Set(pairs.incompatiblePairs.map((p) => `${p.trackedPromptId}::${p.provider}`));
  const measuredKeys = (rs: ProofResult[]) => new Set(rs.filter((r) => r.status === "measured").map(keyOf));
  const bKeys = measuredKeys(baseline.results);
  const fKeys = measuredKeys(followUp.results);
  const comparableKeys = new Set([...fKeys].filter((k) => bKeys.has(k) && !incompatible.has(k)));
  const onComparable = (rs: ProofResult[]) => rs.filter((r) => r.status === "measured" && comparableKeys.has(keyOf(r)));
  const b = onComparable(baseline.results);
  const f = onComparable(followUp.results);

  const comparable = reasons.length === 0;
  const rate = (rs: ProofResult[]) => (rs.length ? rs.filter((r) => r.mentioned === true).length / rs.length : null);
  const share = (rs: ProofResult[]) => {
    const customer = rs.filter((r) => r.mentioned === true).length;
    const comp = rs.reduce((n, r) => n + r.competitorIdsMentioned.length, 0);
    return customer + comp > 0 ? comp / (customer + comp) : null;
  };
  const domains = (rs: ProofResult[]) => new Set(rs.flatMap((r) => r.nativeCitationDomains));
  const bd = domains(b);
  const fd = domains(f);

  return {
    comparable,
    reasons,
    comparablePairs: comparable ? pairs.comparablePairs : 0,
    comparableSamples: { baseline: b.length, followUp: f.length },
    pairs,
    mentionRate: comparable ? rd(rate(b), rate(f)) : rd(null, null),
    mentions: { baseline: b.filter((r) => r.mentioned === true).length, followUp: f.filter((r) => r.mentioned === true).length },
    competitorShareComparable: comparable && !competitorsChanged,
    competitorShareReason: !comparable ? "measurements are not comparable" : competitorsChanged ? "the tracked competitors changed between the two measurements" : null,
    competitorShare: comparable && !competitorsChanged ? rd(share(b), share(f)) : rd(null, null),
    citationDomains: {
      gained: [...fd].filter((d) => !bd.has(d)).sort(),
      lost: [...bd].filter((d) => !fd.has(d)).sort(),
      kept: [...bd].filter((d) => fd.has(d)).sort(),
    },
  };
}
