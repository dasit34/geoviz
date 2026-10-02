/**
 * In-memory TrackingStore + fake provider client for the tracking tests.
 * Enforces the same rules as the Prisma store: one cycle per
 * (subscription, cycleKey); one row per (cycle, prompt, provider, sample);
 * compare-and-set call-state transitions.
 */
import type { ClaimOutcome, CycleRecord, TrackingStore } from "../../src/lib/monitoring/tracking/cycle";
import type { CycleMetrics } from "../../src/lib/monitoring/tracking/metrics";
import type {
  CallState,
  NormalizedResult,
  ProviderAnswer,
  RawCapture,
  ResultForMetrics,
  StillRunning,
  TrackingProvider,
  TrackingProviderClient,
} from "../../src/lib/monitoring/tracking/types";

export type FakeRow = Omit<Partial<NormalizedResult>, "status"> & {
  id: string;
  cycleId: string;
  trackedPromptId: string;
  provider: string;
  sampleIndex: number;
  claimedAt: Date;
  callStateNow: CallState;
  status: string;
  providerRequestId: string | null;
};

export function createFakeTrackingStore(prompts: Array<{ id: string; text: string }>) {
  const cycles = new Map<string, CycleRecord & { key: string; summary?: CycleMetrics; unknownOutcomes?: number; estimatedCostUsd?: number | null }>();
  const rows: FakeRow[] = [];
  let n = 0;
  const get = (id: string) => rows.find((r) => r.id === id)!;
  const store: TrackingStore = {
    async getOrCreateCycle({ subscriptionId, cycleKey, promptIds, providers, competitors, samplesPerPrompt }) {
      const key = `${subscriptionId}::${cycleKey}`;
      const existing = [...cycles.values()].find((c) => c.key === key);
      if (existing) return { cycle: { ...existing }, created: false };
      const c = { id: `cycle_${++n}`, key, status: "running", promptIds, providers, competitors, samplesPerPrompt };
      cycles.set(c.id, c);
      return { cycle: { ...c }, created: true };
    },
    async reopenCycle(id) {
      cycles.get(id)!.status = "running";
    },
    async getPromptTexts(ids) {
      return ids.map((id) => prompts.find((p) => p.id === id)).filter((p): p is { id: string; text: string } => !!p);
    },
    async claimSample({ cycleId, trackedPromptId, provider, sampleIndex, now, staleBefore, retryUnknown }): Promise<ClaimOutcome> {
      const ex = rows.find((r) => r.cycleId === cycleId && r.trackedPromptId === trackedPromptId && r.provider === provider && r.sampleIndex === sampleIndex);
      if (!ex) {
        const row: FakeRow = { id: `res_${++n}`, cycleId, trackedPromptId, provider, sampleIndex, claimedAt: now, callStateNow: "pending", status: "pending", providerRequestId: null };
        rows.push(row);
        return { state: "claimed", resultId: row.id };
      }
      if (ex.callStateNow === "completed" || ex.callStateNow === "failed") return { state: "done" };
      if (ex.callStateNow === "unknown") {
        if (!retryUnknown) return { state: "unknown" };
        Object.assign(ex, { callStateNow: "pending", status: "pending", claimedAt: now, providerRequestId: null });
        return { state: "claimed", resultId: ex.id };
      }
      if (ex.claimedAt >= staleBefore) return { state: "in_progress" };
      if (ex.callStateNow === "pending") {
        ex.claimedAt = now;
        return { state: "claimed", resultId: ex.id };
      }
      return { state: "stale_in_flight", resultId: ex.id, providerRequestId: ex.providerRequestId };
    },
    async markInFlight(id, { now }) {
      Object.assign(get(id), { callStateNow: "in_flight", claimedAt: now });
    },
    async setProviderRequestId(id, rid) {
      get(id).providerRequestId = rid;
    },
    async markUnknown(id, { staleBefore }) {
      const r = get(id);
      if (r.callStateNow !== "in_flight" || r.claimedAt >= staleBefore) return false;
      Object.assign(r, { callStateNow: "unknown", status: "not_measured", positionStatus: "not_measured" });
      return true;
    },
    async completeSample(id, result) {
      const r = get(id);
      Object.assign(r, result, { callStateNow: result.callState, providerRequestId: result.providerRequestId ?? r.providerRequestId });
    },
    async listCycleResults(cycleId): Promise<ResultForMetrics[]> {
      return rows.filter((r) => r.cycleId === cycleId).map((r) => ({
        trackedPromptId: r.trackedPromptId, provider: r.provider, sampleIndex: r.sampleIndex, status: r.status, callState: r.callStateNow,
        mentioned: r.mentioned ?? null, position: r.position ?? null, positionStatus: r.positionStatus ?? null, configFingerprint: r.configFingerprint ?? null,
        citedDomains: r.citedDomains ?? [], namedBusinesses: r.namedBusinesses ?? [], competitorIdsMentioned: r.competitorIdsMentioned ?? [], costUsd: r.costUsd ?? null,
      }));
    },
    async finishCycle(cycleId, { status, summary, unknownOutcomes, estimatedCostUsd }) {
      Object.assign(cycles.get(cycleId)!, { status, summary, unknownOutcomes, estimatedCostUsd });
    },
  };
  return { store, cycles, rows };
}

export type FakeReply =
  | { text: string; citations?: string[]; usage?: { inputTokens: number; outputTokens: number; searchCalls: number; reportedCostUsd?: number } }
  | { fail: "failed" | "unknown"; message?: string }
  | { stillRunning: true }
  | { crash: true };

/**
 * Fake provider client. `reply` decides each call; `{ crash: true }` throws
 * from inside `run` after the request was "sent" (simulates the process
 * dying mid-request). `retrievable` lists providers that support retrieval;
 * `stored` holds what retrieval returns per request id.
 */
export function createFakeClient(reply: (provider: TrackingProvider, prompt: string, call: number) => FakeReply, opts: { retrievable?: TrackingProvider[] } = {}) {
  const calls: Array<{ provider: TrackingProvider; prompt: string }> = [];
  const retrievals: string[] = [];
  const stored = new Map<string, ProviderAnswer | StillRunning>();
  let seq = 0;
  const toAnswer = (provider: TrackingProvider, r: FakeReply, rid: string | null): ProviderAnswer | StillRunning => {
    if ("stillRunning" in r) return { pending: true };
    if ("fail" in r) {
      return { ok: false, provider, model: "m", outcome: r.fail, errorCode: r.fail === "unknown" ? "timeout" : "provider_error", errorMessage: r.message ?? r.fail, providerRequestId: rid, latencyMs: 3 };
    }
    if ("crash" in r) throw new Error("process crashed");
    const raw: RawCapture = { text: r.text, citations: (r.citations ?? []).map((url) => ({ url })), searchQueries: [], finishReason: "stop", responseId: rid, usage: null };
    return {
      ok: true, provider, model: `${provider}-model`, searchSettings: { grounding: "web_search", tool: "t" }, answerText: r.text,
      nativeCitationUrls: r.citations ?? [], raw, usage: r.usage ?? null, providerRequestId: rid, latencyMs: 3,
    };
  };
  const client: TrackingProviderClient = {
    supportsRetrieval: (p) => (opts.retrievable ?? []).includes(p),
    async run(provider, prompt, hooks) {
      calls.push({ provider, prompt });
      const r = reply(provider, prompt, calls.length);
      let rid: string | null = null;
      if ((opts.retrievable ?? []).includes(provider)) {
        rid = `req_${++seq}`;
        await hooks?.onSubmitted?.(rid);
        if (!("crash" in r) && !("stillRunning" in r)) stored.set(rid, toAnswer(provider, r, rid));
        if ("crash" in r || "stillRunning" in r) {
          // Provider keeps working on it server-side; retrieval later gets this answer.
          stored.set(rid, toAnswer(provider, { text: "Late answer naming Rock Roofing." }, rid));
        }
      }
      return toAnswer(provider, r, rid);
    },
    async retrieve(_provider, rid) {
      retrievals.push(rid);
      return stored.get(rid) ?? { pending: true };
    },
  };
  return { client, calls, retrievals };
}

/** A measured-by-default ResultForMetrics for metric tests. */
export function makeResult(over: Partial<ResultForMetrics> = {}): ResultForMetrics {
  return {
    trackedPromptId: "p1", provider: "openai", sampleIndex: 0, status: "measured", callState: "completed",
    mentioned: false, position: null, positionStatus: "no_ordered_list", configFingerprint: "fp-A",
    citedDomains: [], namedBusinesses: [], competitorIdsMentioned: [], costUsd: null, ...over,
  };
}
