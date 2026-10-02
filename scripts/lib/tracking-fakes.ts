/**
 * In-memory TrackingStore + fake provider runner for the tracking tests.
 * Enforces the same uniqueness rules as Prisma: one cycle per
 * (subscription, cycleKey); one result per (cycle, prompt, provider).
 */
import type { ClaimOutcome, CycleRecord, TrackingStore } from "../../src/lib/monitoring/tracking/cycle";
import type { CycleMetrics } from "../../src/lib/monitoring/tracking/metrics";
import type { NormalizedResult, ProviderAnswer, ResultForMetrics, TrackingProvider } from "../../src/lib/monitoring/tracking/types";

type Row = NormalizedResult & { id: string; cycleId: string; trackedPromptId: string; provider: string; claimedAt: Date; pending: boolean };

export function createFakeTrackingStore(prompts: Array<{ id: string; text: string }>) {
  const cycles = new Map<string, CycleRecord & { key: string; summary?: CycleMetrics }>();
  const rows: Row[] = [];
  let n = 0;
  const store: TrackingStore = {
    async getOrCreateCycle({ subscriptionId, cycleKey, promptIds, providers, competitors }) {
      const key = `${subscriptionId}::${cycleKey}`;
      const existing = [...cycles.values()].find((c) => c.key === key);
      if (existing) return { cycle: { ...existing }, created: false };
      const c = { id: `cycle_${++n}`, key, status: "running", promptIds, providers, competitors };
      cycles.set(c.id, c);
      return { cycle: { ...c }, created: true };
    },
    async getPromptTexts(ids) {
      return ids.map((id) => prompts.find((p) => p.id === id)).filter((p): p is { id: string; text: string } => !!p);
    },
    async claimResult({ cycleId, trackedPromptId, provider, now, staleBefore }): Promise<ClaimOutcome> {
      const existing = rows.find((r) => r.cycleId === cycleId && r.trackedPromptId === trackedPromptId && r.provider === provider);
      if (!existing) {
        const row = {
          id: `res_${++n}`, cycleId, trackedPromptId, provider, claimedAt: now, pending: true,
          status: "not_measured" as const, errorCode: null, errorMessage: null, groundingMode: null, model: null, mentioned: null,
          position: null, citedUrls: [], citedDomains: [], namedBusinesses: [], competitorIdsMentioned: [], matchEvidence: null,
          detectorVersion: null, answerText: null, latencyMs: null,
        };
        rows.push(row);
        return { state: "claimed", resultId: row.id };
      }
      if (!existing.pending) return { state: "done" };
      if (existing.claimedAt < staleBefore) {
        existing.claimedAt = now;
        return { state: "claimed", resultId: existing.id };
      }
      return { state: "in_progress" };
    },
    async completeResult(id, result) {
      const r = rows.find((x) => x.id === id)!;
      Object.assign(r, result, { pending: false });
    },
    async listCycleResults(cycleId): Promise<ResultForMetrics[]> {
      return rows.filter((r) => r.cycleId === cycleId && !r.pending).map((r) => ({
        trackedPromptId: r.trackedPromptId, provider: r.provider, status: r.status, mentioned: r.mentioned, position: r.position,
        citedDomains: r.citedDomains, namedBusinesses: r.namedBusinesses, competitorIdsMentioned: r.competitorIdsMentioned,
      }));
    },
    async finishCycle(cycleId, { status, summary }) {
      const c = cycles.get(cycleId)!;
      c.status = status;
      c.summary = summary;
    },
  };
  return { store, cycles, rows };
}

/** Fake runner: counts calls per provider; `answers` decides what each provider says. */
export function createFakeRunner(answers: (provider: TrackingProvider, prompt: string) => Partial<Extract<ProviderAnswer, { ok: true }>> | { fail: string }) {
  const calls: Array<{ provider: TrackingProvider; prompt: string }> = [];
  const runner = async (provider: TrackingProvider, prompt: string): Promise<ProviderAnswer> => {
    calls.push({ provider, prompt });
    const a = answers(provider, prompt);
    if ("fail" in a) return { ok: false, provider, model: "m", errorCode: "provider_error", errorMessage: a.fail, latencyMs: 5 };
    return { ok: true, provider, model: "m", groundingMode: "web_search", answerText: "", namedBusinesses: [], nativeCitationUrls: [], latencyMs: 5, ...a };
  };
  return { runner, calls };
}
