/**
 * One prompt-tracking cycle for one subscription — idempotent and resumable.
 *
 * Cycle: `(subscriptionId, cycleKey)` is unique → a retried or concurrent
 * trigger resumes the SAME cycle; a finished cycle is never re-run (0 new
 * provider calls). The cycle snapshots its prompts / providers /
 * competitors / samples so a resume measures exactly the same set.
 *
 * Each SAMPLE row moves through provider-call states:
 *   pending   — claimed; no request sent yet.
 *   in_flight — written BEFORE the paid request is sent.
 *   completed — answer received (status measured, or not_measured for an
 *               unusable answer).
 *   failed    — the provider definitively did not answer (known outcome).
 *   unknown   — a request may have been processed and billed (crash,
 *               timeout, dropped connection). Never retried automatically.
 *
 * Resume rules (after `STALE_CLAIM_MS`):
 *   stale pending   → re-claimed and called (no request was ever sent).
 *   stale in_flight → if the provider supports request retrieval and we
 *                     persisted its request id (OpenAI background mode),
 *                     RETRIEVE the result; otherwise mark `unknown`.
 *
 * GUARANTEE: at most ONE automatic provider request per sample. NOT
 * exactly-once billing: an `unknown` sample may or may not have been billed,
 * and is surfaced for operator review (cycle status `needs_review`). Only an
 * explicit operator retry (`retryUnknown`) re-issues it, accepting a
 * possible duplicate charge. Conservative edge: a crash between writing
 * `in_flight` and actually sending marks the sample `unknown` even though
 * nothing was sent.
 */
import { buildEntityMatcher } from "./detector";
import { computeCycleMetrics, METRICS_VERSION, type CycleMetrics } from "./metrics";
import { normalizeProviderAnswer } from "./normalize";
import { TRACKING_PROMPT_VERSION } from "./providers";
import type {
  CompetitorRef,
  NormalizedResult,
  ProviderAnswer,
  ResultForMetrics,
  StillRunning,
  TrackingProvider,
  TrackingProviderClient,
} from "./types";

export const STALE_CLAIM_MS = 15 * 60 * 1000;
const FINAL_CYCLE_STATUSES = new Set(["completed", "partial", "failed"]);

export type CycleRecord = {
  id: string;
  status: string;
  promptIds: string[];
  providers: string[];
  competitors: CompetitorRef[];
  samplesPerPrompt: number;
};

export type ClaimOutcome =
  | { state: "claimed"; resultId: string }
  | { state: "done" }
  | { state: "unknown" }
  | { state: "in_progress" }
  | { state: "stale_in_flight"; resultId: string; providerRequestId: string | null };

export interface TrackingStore {
  getOrCreateCycle(args: {
    subscriptionId: string;
    cycleKey: string;
    trigger: "scheduler" | "manual";
    promptIds: string[];
    providers: string[];
    competitors: CompetitorRef[];
    samplesPerPrompt: number;
    now: Date;
    /** Proof Engine: the fixed question-set version this cycle measures (null = none). */
    questionSet?: { id: string; version: number } | null;
  }): Promise<{ cycle: CycleRecord; created: boolean }>;
  reopenCycle(cycleId: string): Promise<void>;
  getPromptTexts(promptIds: string[]): Promise<Array<{ id: string; text: string }>>;
  claimSample(args: {
    cycleId: string;
    trackedPromptId: string;
    provider: string;
    sampleIndex: number;
    subscriptionId: string;
    now: Date;
    staleBefore: Date;
    retryUnknown: boolean;
  }): Promise<ClaimOutcome>;
  markInFlight(resultId: string, args: { now: Date; promptVersion: string }): Promise<void>;
  setProviderRequestId(resultId: string, providerRequestId: string): Promise<void>;
  /** Atomic: only flips a still-stale in_flight row. */
  markUnknown(resultId: string, args: { now: Date; staleBefore: Date }): Promise<boolean>;
  completeSample(resultId: string, result: NormalizedResult, now: Date): Promise<void>;
  listCycleResults(cycleId: string): Promise<ResultForMetrics[]>;
  finishCycle(cycleId: string, args: {
    status: "completed" | "partial" | "failed" | "needs_review";
    summary: CycleMetrics;
    metricsVersion: string;
    unknownOutcomes: number;
    estimatedCostUsd: number | null;
    now: Date;
  }): Promise<void>;
}

export type CycleSubject = {
  subscriptionId: string;
  businessName: string | null;
  websiteUrl: string;
  customerDomain: string | null;
};

export type CycleCounters = {
  providerCalls: number;
  retrievals: number;
  markedUnknown: number;
  alreadyFinal: number;
  inProgressElsewhere: number;
};

export type RunCycleResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "already_completed"; cycleId: string; status: string }
  | ({
      outcome: "ran";
      cycleId: string;
      status: "completed" | "partial" | "failed" | "needs_review" | "running";
      metrics: CycleMetrics | null;
      unknownOutcomes: number;
      estimatedCostUsd: number | null;
    } & CycleCounters);

const isStillRunning = (a: ProviderAnswer | StillRunning): a is StillRunning => "pending" in a && (a as StillRunning).pending === true;

export async function runMonitoringCycle(args: {
  store: TrackingStore;
  client: TrackingProviderClient;
  subject: CycleSubject;
  activePrompts: Array<{ id: string }>;
  activeCompetitors: CompetitorRef[];
  providers: readonly TrackingProvider[];
  samplesPerPrompt: number;
  cycleKey: string;
  trigger: "scheduler" | "manual";
  now: () => Date;
  /** Operator-only: re-issue unknown-outcome samples (may double-charge). */
  retryUnknown?: boolean;
  /** Proof Engine: tag the cycle with the fixed question-set version it measures. */
  questionSet?: { id: string; version: number } | null;
}): Promise<RunCycleResult> {
  if (args.activePrompts.length === 0) return { outcome: "skipped", reason: "no active tracked questions" };
  if (args.providers.length === 0) return { outcome: "skipped", reason: "plan grants no tracking providers" };
  const retryUnknown = args.retryUnknown === true;

  const { cycle } = await args.store.getOrCreateCycle({
    subscriptionId: args.subject.subscriptionId,
    cycleKey: args.cycleKey,
    trigger: args.trigger,
    promptIds: args.activePrompts.map((p) => p.id),
    providers: [...args.providers],
    competitors: args.activeCompetitors,
    samplesPerPrompt: Math.max(1, args.samplesPerPrompt),
    now: args.now(),
    questionSet: args.questionSet ?? null,
  });
  if (FINAL_CYCLE_STATUSES.has(cycle.status)) return { outcome: "already_completed", cycleId: cycle.id, status: cycle.status };
  if (cycle.status === "needs_review") {
    if (!retryUnknown) return { outcome: "already_completed", cycleId: cycle.id, status: cycle.status };
    await args.store.reopenCycle(cycle.id);
  }

  const customer = buildEntityMatcher({
    id: "customer",
    name: args.subject.businessName || args.subject.customerDomain || args.subject.websiteUrl,
    websiteUrl: args.subject.websiteUrl,
  });
  const competitorMatchers = cycle.competitors.map((c) =>
    buildEntityMatcher({ id: c.id, name: c.name, websiteUrl: c.domain ? `https://${c.domain}` : null }),
  );
  const normalize = (a: ProviderAnswer) => normalizeProviderAnswer(a, customer, competitorMatchers, TRACKING_PROMPT_VERSION);
  const prompts = await args.store.getPromptTexts(cycle.promptIds);
  const c: CycleCounters = { providerCalls: 0, retrievals: 0, markedUnknown: 0, alreadyFinal: 0, inProgressElsewhere: 0 };

  async function runSample(prompt: { id: string; text: string }, provider: TrackingProvider, sampleIndex: number) {
    const now = args.now();
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
    const claim = await args.store.claimSample({
      cycleId: cycle.id, trackedPromptId: prompt.id, provider, sampleIndex, subscriptionId: args.subject.subscriptionId, now, staleBefore, retryUnknown,
    });
    switch (claim.state) {
      case "done":
      case "unknown":
        c.alreadyFinal += 1;
        return;
      case "in_progress":
        c.inProgressElsewhere += 1;
        return;
      case "stale_in_flight": {
        if (claim.providerRequestId && args.client.supportsRetrieval(provider)) {
          c.retrievals += 1;
          const got = await args.client.retrieve(provider, claim.providerRequestId);
          if (isStillRunning(got)) return void (c.inProgressElsewhere += 1);
          await args.store.completeSample(claim.resultId, normalize(got), args.now());
          return;
        }
        if (await args.store.markUnknown(claim.resultId, { now, staleBefore })) c.markedUnknown += 1;
        return;
      }
      case "claimed": {
        await args.store.markInFlight(claim.resultId, { now, promptVersion: TRACKING_PROMPT_VERSION });
        c.providerCalls += 1;
        const answer = await args.client.run(provider, prompt.text, {
          onSubmitted: (id) => args.store.setProviderRequestId(claim.resultId, id),
        });
        if (isStillRunning(answer)) return void (c.inProgressElsewhere += 1); // retrievable later
        await args.store.completeSample(claim.resultId, normalize(answer), args.now());
        return;
      }
    }
  }

  for (const prompt of prompts) {
    await Promise.all(
      (cycle.providers as TrackingProvider[]).map(async (provider) => {
        for (let s = 0; s < cycle.samplesPerPrompt; s += 1) await runSample(prompt, provider, s);
      }),
    );
  }

  const results = await args.store.listCycleResults(cycle.id);
  const open = results.some((r) => r.callState === "pending" || r.callState === "in_flight");
  if (open || c.inProgressElsewhere > 0) {
    return { outcome: "ran", cycleId: cycle.id, status: "running", metrics: null, unknownOutcomes: 0, estimatedCostUsd: null, ...c };
  }
  const metrics = computeCycleMetrics(results, args.subject.customerDomain, cycle.competitors);
  const unknownOutcomes = results.filter((r) => r.callState === "unknown").length;
  const costs = results.map((r) => r.costUsd).filter((x): x is number => typeof x === "number");
  const estimatedCostUsd = costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) * 1e6) / 1e6 : null;
  const status = unknownOutcomes > 0 ? "needs_review" : metrics.measured === 0 ? "failed" : metrics.notMeasured > 0 ? "partial" : "completed";
  await args.store.finishCycle(cycle.id, { status, summary: metrics, metricsVersion: METRICS_VERSION, unknownOutcomes, estimatedCostUsd, now: args.now() });
  return { outcome: "ran", cycleId: cycle.id, status, metrics, unknownOutcomes, estimatedCostUsd, ...c };
}
