/**
 * Visibility metrics (pure). Rates use SUCCESSFULLY MEASURED samples only —
 * a failed or unknown-outcome call is "not measured", never a "no", and
 * every block reports how many samples it rests on (`answers`, `measured`,
 * `coverage`). Rates are null (not 0) when nothing was measured.
 * These metrics are separate from the GeoViz audit score and never feed it.
 */
import { domainMatches } from "./citations";
import type { CompetitorRef, ResultForMetrics } from "./types";

export const METRICS_VERSION = "tracking-metrics@2.0.0";

export type CompetitorMetrics = {
  id: string;
  name: string;
  mentions: number;
  mentionRate: number | null;
  citationRate: number | null;
};

export type MetricsBlock = {
  /** Samples attempted. */
  answers: number;
  measured: number;
  notMeasured: number;
  unknownOutcomes: number;
  /** measured ÷ attempted; null when nothing was attempted. */
  coverage: number | null;
  customerMentions: number;
  mentionRate: number | null;
  citationRate: number | null;
  /** Mean of ranked positions only (clear ordered lists). */
  averagePosition: number | null;
  rankedSamples: number;
  /** customer mentions ÷ (customer + tracked-competitor mentions); null when no competitors are tracked or nobody was mentioned. */
  shareOfVoice: number | null;
  competitors: CompetitorMetrics[];
};

export type PairStat = { trackedPromptId: string; provider: string; samples: number; measured: number; named: number };

export type CycleMetrics = MetricsBlock & {
  version: string;
  byProvider: Record<string, MetricsBlock>;
  /** Per (question, AI system): "named in k of n measured samples". */
  pairs: PairStat[];
};

const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null);

function block(results: ResultForMetrics[], customerDomain: string | null, competitors: CompetitorRef[]): MetricsBlock {
  const measured = results.filter((r) => r.status === "measured");
  const customerMentions = measured.filter((r) => r.mentioned === true).length;
  const customerCited = measured.filter((r) => r.citedDomains.some((d) => domainMatches(d, customerDomain))).length;
  const ranked = measured.filter((r) => r.positionStatus === "ranked" && typeof r.position === "number");

  const comps: CompetitorMetrics[] = competitors.map((c) => {
    const mentions = measured.filter((r) => r.competitorIdsMentioned.includes(c.id)).length;
    const cited = c.domain ? measured.filter((r) => r.citedDomains.some((d) => domainMatches(d, c.domain))).length : 0;
    return { id: c.id, name: c.name, mentions, mentionRate: rate(mentions, measured.length), citationRate: c.domain ? rate(cited, measured.length) : null };
  });
  const totalVoice = customerMentions + comps.reduce((s, c) => s + c.mentions, 0);

  return {
    answers: results.length,
    measured: measured.length,
    notMeasured: results.length - measured.length,
    unknownOutcomes: results.filter((r) => r.callState === "unknown").length,
    coverage: rate(measured.length, results.length),
    customerMentions,
    mentionRate: rate(customerMentions, measured.length),
    citationRate: customerDomain ? rate(customerCited, measured.length) : null,
    averagePosition: ranked.length > 0 ? ranked.reduce((a, r) => a + (r.position as number), 0) / ranked.length : null,
    rankedSamples: ranked.length,
    // Share of voice needs something to share with: no tracked competitors → not measured.
    shareOfVoice: competitors.length > 0 && totalVoice > 0 ? customerMentions / totalVoice : null,
    competitors: comps,
  };
}

const pairKey = (r: { trackedPromptId: string; provider: string }) => `${r.trackedPromptId}::${r.provider}`;

export function pairStats(results: ResultForMetrics[]): PairStat[] {
  const m = new Map<string, PairStat>();
  for (const r of results) {
    const p = m.get(pairKey(r)) ?? { trackedPromptId: r.trackedPromptId, provider: r.provider, samples: 0, measured: 0, named: 0 };
    p.samples += 1;
    if (r.status === "measured") {
      p.measured += 1;
      if (r.mentioned === true) p.named += 1;
    }
    m.set(pairKey(r), p);
  }
  return [...m.values()];
}

export function computeCycleMetrics(results: ResultForMetrics[], customerDomain: string | null, competitors: CompetitorRef[]): CycleMetrics {
  const providers = Array.from(new Set(results.map((r) => r.provider))).sort();
  const byProvider: Record<string, MetricsBlock> = {};
  for (const p of providers) byProvider[p] = block(results.filter((r) => r.provider === p), customerDomain, competitors);
  return { version: METRICS_VERSION, ...block(results, customerDomain, competitors), byProvider, pairs: pairStats(results) };
}

export type MetricDelta = { previous: number | null; current: number | null; change: number | null };

export type IncompatiblePair = { trackedPromptId: string; provider: string; reason: string };

export type CycleComparison = {
  comparable: boolean;
  /** (question, AI system) pairs measured in BOTH cycles under the SAME configuration. */
  comparablePairs: number;
  incompatiblePairs: IncompatiblePair[];
  reason: string | null;
  mentionRate: MetricDelta;
  citationRate: MetricDelta;
  shareOfVoice: MetricDelta;
  averagePosition: MetricDelta;
  gainedMentions: Array<{ trackedPromptId: string; provider: string }>;
  lostMentions: Array<{ trackedPromptId: string; provider: string }>;
};

const delta = (previous: number | null, current: number | null): MetricDelta => ({
  previous,
  current,
  change: previous !== null && current !== null ? current - previous : null,
});

/** Why two configuration fingerprints differ, in plain language. */
export function fingerprintDifference(a: string | null, b: string | null): string {
  if (!a || !b) return "measurement settings unknown for one run";
  const [pa, , ma, sa, ea, da] = a.split("|");
  const [pb, , mb, sb, eb, db] = b.split("|");
  const reasons: string[] = [];
  if (pa !== pb) reasons.push("question format version changed");
  if (ma !== mb) reasons.push("AI model changed");
  if (sa !== sb) reasons.push("search settings changed");
  if (ea !== eb || da !== db) reasons.push("measurement method changed");
  return reasons.join(", ") || "measurement settings changed";
}

function fingerprintOf(results: ResultForMetrics[]): string | null {
  return results.find((r) => r.status === "measured" && r.configFingerprint)?.configFingerprint ?? null;
}

/**
 * Like-for-like comparison: only (question, AI system) pairs that were
 * measured in BOTH cycles under the SAME configuration fingerprint count.
 * Pairs measured in both but under different settings are reported as
 * incompatible (with the reason), never silently compared.
 */
export function compareCycles(
  previous: ResultForMetrics[],
  current: ResultForMetrics[],
  customerDomain: string | null,
  competitors: CompetitorRef[],
): CycleComparison {
  const group = (rs: ResultForMetrics[]) => {
    const m = new Map<string, ResultForMetrics[]>();
    for (const r of rs) m.set(pairKey(r), [...(m.get(pairKey(r)) ?? []), r]);
    return m;
  };
  const prev = group(previous);
  const curr = group(current);
  const compatible: string[] = [];
  const incompatiblePairs: IncompatiblePair[] = [];
  for (const [k, cs] of curr) {
    const ps = prev.get(k);
    if (!ps) continue;
    if (!ps.some((r) => r.status === "measured") || !cs.some((r) => r.status === "measured")) continue;
    const fa = fingerprintOf(ps);
    const fb = fingerprintOf(cs);
    if (fa && fb && fa === fb) compatible.push(k);
    else incompatiblePairs.push({ trackedPromptId: cs[0]!.trackedPromptId, provider: cs[0]!.provider, reason: fingerprintDifference(fa, fb) });
  }

  if (compatible.length === 0) {
    const none = delta(null, null);
    return {
      comparable: false,
      comparablePairs: 0,
      incompatiblePairs,
      reason: incompatiblePairs.length > 0
        ? `Not comparable: ${incompatiblePairs[0]!.reason}.`
        : "No question was measured by the same AI system in both runs.",
      mentionRate: none, citationRate: none, shareOfVoice: none, averagePosition: none, gainedMentions: [], lostMentions: [],
    };
  }

  const pick = (m: Map<string, ResultForMetrics[]>) => compatible.flatMap((k) => m.get(k)!);
  const p = block(pick(prev), customerDomain, competitors);
  const c = block(pick(curr), customerDomain, competitors);
  const pairRate = (rs: ResultForMetrics[]) => {
    const ms = rs.filter((r) => r.status === "measured");
    return ms.length ? ms.filter((r) => r.mentioned === true).length / ms.length : 0;
  };
  const gained: CycleComparison["gainedMentions"] = [];
  const lost: CycleComparison["lostMentions"] = [];
  for (const k of compatible) {
    const a = pairRate(prev.get(k)!);
    const b = pairRate(curr.get(k)!);
    const ref = curr.get(k)![0]!;
    if (a === 0 && b > 0) gained.push({ trackedPromptId: ref.trackedPromptId, provider: ref.provider });
    if (a > 0 && b === 0) lost.push({ trackedPromptId: ref.trackedPromptId, provider: ref.provider });
  }
  return {
    comparable: true,
    comparablePairs: compatible.length,
    incompatiblePairs,
    reason: null,
    mentionRate: delta(p.mentionRate, c.mentionRate),
    citationRate: delta(p.citationRate, c.citationRate),
    shareOfVoice: delta(p.shareOfVoice, c.shareOfVoice),
    averagePosition: delta(p.averagePosition, c.averagePosition),
    gainedMentions: gained,
    lostMentions: lost,
  };
}
