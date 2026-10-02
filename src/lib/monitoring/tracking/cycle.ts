/**
 * One prompt-tracking cycle for one subscription (idempotent, resumable).
 *
 * - `(subscriptionId, cycleKey)` is unique → a retried or concurrent
 *   trigger resumes the SAME cycle; a completed cycle is never re-run.
 * - Each (cycle, prompt, provider) result row is CLAIMED before the
 *   provider is called → no answer is ever paid for twice. A claim left
 *   behind by a crashed run is re-claimable after `STALE_CLAIM_MS`.
 * - NOT_MEASURED results are final for their cycle (no automatic paid
 *   retries); the next cycle measures again.
 * - The cycle snapshots which prompts/providers/competitors it covers, so
 *   resuming after the customer edits their lists measures the same set.
 */
import { buildEntityMatcher } from "./detector";
import { computeCycleMetrics, METRICS_VERSION, type CycleMetrics } from "./metrics";
import { normalizeProviderAnswer } from "./normalize";
import type { CompetitorRef, NormalizedResult, ResultForMetrics, TrackingProvider, TrackingProviderRunner } from "./types";

export const STALE_CLAIM_MS = 15 * 60 * 1000;

export type CycleRecord = {
  id: string;
  status: string;
  promptIds: string[];
  providers: string[];
  competitors: CompetitorRef[];
};

export type ClaimOutcome = { state: "claimed"; resultId: string } | { state: "done" } | { state: "in_progress" };

export interface TrackingStore {
  getOrCreateCycle(args: {
    subscriptionId: string;
    cycleKey: string;
    trigger: "scheduler" | "manual";
    promptIds: string[];
    providers: string[];
    competitors: CompetitorRef[];
    now: Date;
  }): Promise<{ cycle: CycleRecord; created: boolean }>;
  getPromptTexts(promptIds: string[]): Promise<Array<{ id: string; text: string }>>;
  claimResult(args: { cycleId: string; trackedPromptId: string; provider: string; subscriptionId: string; now: Date; staleBefore: Date }): Promise<ClaimOutcome>;
  completeResult(resultId: string, result: NormalizedResult, now: Date): Promise<void>;
  listCycleResults(cycleId: string): Promise<ResultForMetrics[]>;
  finishCycle(cycleId: string, args: { status: "completed" | "partial" | "failed"; summary: CycleMetrics; metricsVersion: string; now: Date }): Promise<void>;
}

export type CycleSubject = {
  subscriptionId: string;
  businessName: string | null;
  websiteUrl: string;
  customerDomain: string | null;
};

export type RunCycleResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "already_completed"; cycleId: string }
  | {
      outcome: "ran";
      cycleId: string;
      status: "completed" | "partial" | "failed" | "running";
      providerCalls: number;
      alreadyHadResults: number;
      inProgressElsewhere: number;
      metrics: CycleMetrics | null;
    };

export async function runMonitoringCycle(args: {
  store: TrackingStore;
  runner: TrackingProviderRunner;
  subject: CycleSubject;
  activePrompts: Array<{ id: string }>;
  activeCompetitors: CompetitorRef[];
  providers: readonly TrackingProvider[];
  cycleKey: string;
  trigger: "scheduler" | "manual";
  now: () => Date;
}): Promise<RunCycleResult> {
  if (args.activePrompts.length === 0) return { outcome: "skipped", reason: "no active tracked questions" };
  if (args.providers.length === 0) return { outcome: "skipped", reason: "plan grants no tracking providers" };

  const { cycle } = await args.store.getOrCreateCycle({
    subscriptionId: args.subject.subscriptionId,
    cycleKey: args.cycleKey,
    trigger: args.trigger,
    promptIds: args.activePrompts.map((p) => p.id),
    providers: [...args.providers],
    competitors: args.activeCompetitors,
    now: args.now(),
  });
  if (cycle.status === "completed" || cycle.status === "partial" || cycle.status === "failed") {
    return { outcome: "already_completed", cycleId: cycle.id };
  }

  const customer = buildEntityMatcher({
    id: "customer",
    name: args.subject.businessName || args.subject.customerDomain || args.subject.websiteUrl,
    websiteUrl: args.subject.websiteUrl,
  });
  const competitorMatchers = cycle.competitors.map((c) =>
    buildEntityMatcher({ id: c.id, name: c.name, websiteUrl: c.domain ? `https://${c.domain}` : null }),
  );
  const prompts = await args.store.getPromptTexts(cycle.promptIds);

  let providerCalls = 0;
  let alreadyHadResults = 0;
  let inProgressElsewhere = 0;

  for (const prompt of prompts) {
    await Promise.all(
      (cycle.providers as TrackingProvider[]).map(async (provider) => {
        const now = args.now();
        const claim = await args.store.claimResult({
          cycleId: cycle.id,
          trackedPromptId: prompt.id,
          provider,
          subscriptionId: args.subject.subscriptionId,
          now,
          staleBefore: new Date(now.getTime() - STALE_CLAIM_MS),
        });
        if (claim.state === "done") return void (alreadyHadResults += 1);
        if (claim.state === "in_progress") return void (inProgressElsewhere += 1);
        providerCalls += 1;
        const answer = await args.runner(provider, prompt.text);
        await args.store.completeResult(claim.resultId, normalizeProviderAnswer(answer, customer, competitorMatchers), args.now());
      }),
    );
  }

  if (inProgressElsewhere > 0) {
    return { outcome: "ran", cycleId: cycle.id, status: "running", providerCalls, alreadyHadResults, inProgressElsewhere, metrics: null };
  }

  const results = await args.store.listCycleResults(cycle.id);
  const metrics = computeCycleMetrics(results, args.subject.customerDomain, cycle.competitors);
  const status = metrics.measured === 0 ? "failed" : metrics.notMeasured > 0 ? "partial" : "completed";
  await args.store.finishCycle(cycle.id, { status, summary: metrics, metricsVersion: METRICS_VERSION, now: args.now() });
  return { outcome: "ran", cycleId: cycle.id, status, providerCalls, alreadyHadResults, inProgressElsewhere, metrics };
}
