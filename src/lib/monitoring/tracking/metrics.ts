/**
 * Visibility metrics (pure). Every rate's denominator is MEASURED answers
 * only — a provider that failed is reported as not measured, never counted
 * as a "no". Rates are null (not 0) when nothing was measured.
 */
import { domainMatches } from "./citations";
import type { CompetitorRef, ResultForMetrics } from "./types";

export const METRICS_VERSION = "tracking-metrics@1.0.0";

export type CompetitorMetrics = {
  id: string;
  name: string;
  mentions: number;
  mentionRate: number | null;
  citationRate: number | null;
};

export type MetricsBlock = {
  answers: number;
  measured: number;
  notMeasured: number;
  customerMentions: number;
  mentionRate: number | null;
  citationRate: number | null;
  averagePosition: number | null;
  /** customer mentions ÷ (customer + tracked-competitor mentions); null when nobody was mentioned. */
  shareOfVoice: number | null;
  competitors: CompetitorMetrics[];
};

export type CycleMetrics = MetricsBlock & {
  version: string;
  byProvider: Record<string, MetricsBlock>;
};

const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null);

function block(results: ResultForMetrics[], customerDomain: string | null, competitors: CompetitorRef[]): MetricsBlock {
  const measured = results.filter((r) => r.status === "measured");
  const customerMentions = measured.filter((r) => r.mentioned === true).length;
  const customerCited = measured.filter((r) => r.citedDomains.some((d) => domainMatches(d, customerDomain))).length;
  const positions = measured.filter((r) => r.mentioned === true && typeof r.position === "number").map((r) => r.position as number);

  const comps: CompetitorMetrics[] = competitors.map((c) => {
    const mentions = measured.filter((r) => r.competitorIdsMentioned.includes(c.id)).length;
    const cited = c.domain ? measured.filter((r) => r.citedDomains.some((d) => domainMatches(d, c.domain))).length : 0;
    return {
      id: c.id,
      name: c.name,
      mentions,
      mentionRate: rate(mentions, measured.length),
      citationRate: c.domain ? rate(cited, measured.length) : null,
    };
  });
  const totalVoice = customerMentions + comps.reduce((s, c) => s + c.mentions, 0);

  return {
    answers: results.length,
    measured: measured.length,
    notMeasured: results.length - measured.length,
    customerMentions,
    mentionRate: rate(customerMentions, measured.length),
    citationRate: customerDomain ? rate(customerCited, measured.length) : null,
    averagePosition: positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
    shareOfVoice: totalVoice > 0 ? customerMentions / totalVoice : null,
    competitors: comps,
  };
}

export function computeCycleMetrics(
  results: ResultForMetrics[],
  customerDomain: string | null,
  competitors: CompetitorRef[],
): CycleMetrics {
  const providers = Array.from(new Set(results.map((r) => r.provider))).sort();
  const byProvider: Record<string, MetricsBlock> = {};
  for (const p of providers) byProvider[p] = block(results.filter((r) => r.provider === p), customerDomain, competitors);
  return { version: METRICS_VERSION, ...block(results, customerDomain, competitors), byProvider };
}

export type MetricDelta = { previous: number | null; current: number | null; change: number | null };

export type CycleComparison = {
  comparable: boolean;
  /** (prompt, provider) pairs measured in BOTH cycles — the only basis for change. */
  comparablePairs: number;
  reason: string | null;
  mentionRate: MetricDelta;
  citationRate: MetricDelta;
  shareOfVoice: MetricDelta;
  averagePosition: MetricDelta;
  /** Prompt/provider pairs that flipped. */
  gainedMentions: Array<{ trackedPromptId: string; provider: string }>;
  lostMentions: Array<{ trackedPromptId: string; provider: string }>;
};

const delta = (previous: number | null, current: number | null): MetricDelta => ({
  previous,
  current,
  change: previous !== null && current !== null ? current - previous : null,
});

/**
 * Like-for-like comparison of two cycles: only (prompt, provider) pairs
 * measured in both count, so adding a prompt, a provider outage, or a new
 * competitor can't masquerade as movement.
 */
export function compareCycles(
  previous: ResultForMetrics[],
  current: ResultForMetrics[],
  customerDomain: string | null,
  competitors: CompetitorRef[],
): CycleComparison {
  const key = (r: ResultForMetrics) => `${r.trackedPromptId}::${r.provider}`;
  const prevMeasured = new Map(previous.filter((r) => r.status === "measured").map((r) => [key(r), r]));
  const currMeasured = new Map(current.filter((r) => r.status === "measured").map((r) => [key(r), r]));
  const shared = [...currMeasured.keys()].filter((k) => prevMeasured.has(k));

  if (shared.length === 0) {
    const none = delta(null, null);
    return {
      comparable: false,
      comparablePairs: 0,
      reason: "No question was measured by the same AI system in both runs.",
      mentionRate: none,
      citationRate: none,
      shareOfVoice: none,
      averagePosition: none,
      gainedMentions: [],
      lostMentions: [],
    };
  }

  const p = block(shared.map((k) => prevMeasured.get(k)!), customerDomain, competitors);
  const c = block(shared.map((k) => currMeasured.get(k)!), customerDomain, competitors);
  const gained: CycleComparison["gainedMentions"] = [];
  const lost: CycleComparison["lostMentions"] = [];
  for (const k of shared) {
    const a = prevMeasured.get(k)!;
    const b = currMeasured.get(k)!;
    if (a.mentioned !== true && b.mentioned === true) gained.push({ trackedPromptId: b.trackedPromptId, provider: b.provider });
    if (a.mentioned === true && b.mentioned !== true) lost.push({ trackedPromptId: b.trackedPromptId, provider: b.provider });
  }
  return {
    comparable: true,
    comparablePairs: shared.length,
    reason: null,
    mentionRate: delta(p.mentionRate, c.mentionRate),
    citationRate: delta(p.citationRate, c.citationRate),
    shareOfVoice: delta(p.shareOfVoice, c.shareOfVoice),
    averagePosition: delta(p.averagePosition, c.averagePosition),
    gainedMentions: gained,
    lostMentions: lost,
  };
}
