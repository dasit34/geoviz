/**
 * Prisma implementation of the tracking store. Every call-state
 * transition is a conditional (compare-and-set) update, so two workers can
 * never both act on the same sample.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import type { ClaimOutcome, CycleRecord, TrackingStore } from "./cycle";
import type { CompetitorRef, ResultForMetrics } from "./types";

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

function toCycleRecord(row: { id: string; status: string; promptIds: unknown; providers: unknown; competitors: unknown; samplesPerPrompt: number }): CycleRecord {
  return {
    id: row.id,
    status: row.status,
    promptIds: strArr(row.promptIds),
    providers: strArr(row.providers),
    competitors: Array.isArray(row.competitors) ? (row.competitors as CompetitorRef[]) : [],
    samplesPerPrompt: row.samplesPerPrompt,
  };
}

export function toResultForMetrics(r: {
  trackedPromptId: string;
  provider: string;
  sampleIndex: number;
  status: string;
  callState: string;
  mentioned: boolean | null;
  position: number | null;
  positionStatus: string | null;
  configFingerprint: string | null;
  citedDomains: unknown;
  namedBusinesses: unknown;
  competitorIdsMentioned: unknown;
  costUsd: Prisma.Decimal | null;
}): ResultForMetrics {
  return {
    trackedPromptId: r.trackedPromptId,
    provider: r.provider,
    sampleIndex: r.sampleIndex,
    status: r.status,
    callState: r.callState,
    mentioned: r.mentioned,
    position: r.position,
    positionStatus: r.positionStatus,
    configFingerprint: r.configFingerprint,
    citedDomains: strArr(r.citedDomains),
    namedBusinesses: strArr(r.namedBusinesses),
    competitorIdsMentioned: strArr(r.competitorIdsMentioned),
    costUsd: r.costUsd === null ? null : Number(r.costUsd),
  };
}

export const prismaTrackingStore: TrackingStore = {
  async getOrCreateCycle({ subscriptionId, cycleKey, trigger, promptIds, providers, competitors, samplesPerPrompt, now, questionSet }) {
    try {
      const row = await prisma.monitoringCycle.create({
        data: {
          subscriptionId, cycleKey, trigger, status: "running", promptIds, providers, competitors, samplesPerPrompt, startedAt: now,
          questionSetId: questionSet?.id ?? null, questionSetVersion: questionSet?.version ?? null,
        },
      });
      return { cycle: toCycleRecord(row), created: true };
    } catch (err) {
      if (!isUnique(err)) throw err;
      const row = await prisma.monitoringCycle.findUniqueOrThrow({ where: { subscriptionId_cycleKey: { subscriptionId, cycleKey } } });
      return { cycle: toCycleRecord(row), created: false };
    }
  },

  async reopenCycle(cycleId) {
    await prisma.monitoringCycle.update({ where: { id: cycleId }, data: { status: "running", completedAt: null } });
  },

  async getPromptTexts(promptIds) {
    const rows = await prisma.trackedPrompt.findMany({ where: { id: { in: promptIds } }, select: { id: true, text: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return promptIds.map((id) => byId.get(id)).filter((r): r is { id: string; text: string } => !!r);
  },

  async claimSample({ cycleId, trackedPromptId, provider, sampleIndex, subscriptionId, now, staleBefore, retryUnknown }): Promise<ClaimOutcome> {
    try {
      const row = await prisma.promptRunResult.create({
        data: {
          cycleId, trackedPromptId, provider, sampleIndex, subscriptionId, status: "pending", callState: "pending", claimedAt: now,
          citedUrls: [], citedDomains: [], namedBusinesses: [], competitorIdsMentioned: [],
        },
        select: { id: true },
      });
      return { state: "claimed", resultId: row.id };
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
    const ex = await prisma.promptRunResult.findUniqueOrThrow({
      where: { cycleId_trackedPromptId_provider_sampleIndex: { cycleId, trackedPromptId, provider, sampleIndex } },
      select: { id: true, callState: true, claimedAt: true, providerRequestId: true },
    });
    if (ex.callState === "completed" || ex.callState === "failed") return { state: "done" };
    if (ex.callState === "unknown") {
      if (!retryUnknown) return { state: "unknown" };
      const { count } = await prisma.promptRunResult.updateMany({
        where: { id: ex.id, callState: "unknown" },
        data: { callState: "pending", status: "pending", claimedAt: now, providerRequestId: null, errorCode: null, errorMessage: null },
      });
      return count === 1 ? { state: "claimed", resultId: ex.id } : { state: "in_progress" };
    }
    if (ex.claimedAt >= staleBefore) return { state: "in_progress" };
    if (ex.callState === "pending") {
      // Stale claim that never sent a request → safe to re-claim.
      const { count } = await prisma.promptRunResult.updateMany({
        where: { id: ex.id, callState: "pending", claimedAt: { lt: staleBefore } },
        data: { claimedAt: now },
      });
      return count === 1 ? { state: "claimed", resultId: ex.id } : { state: "in_progress" };
    }
    return { state: "stale_in_flight", resultId: ex.id, providerRequestId: ex.providerRequestId };
  },

  async markInFlight(resultId, { now, promptVersion }) {
    await prisma.promptRunResult.update({
      where: { id: resultId },
      data: { callState: "in_flight", requestStartedAt: now, claimedAt: now, promptVersion },
    });
  },

  async setProviderRequestId(resultId, providerRequestId) {
    await prisma.promptRunResult.update({ where: { id: resultId }, data: { providerRequestId } });
  },

  async markUnknown(resultId, { now, staleBefore }) {
    const { count } = await prisma.promptRunResult.updateMany({
      where: { id: resultId, callState: "in_flight", claimedAt: { lt: staleBefore } },
      data: {
        callState: "unknown",
        status: "not_measured",
        positionStatus: "not_measured",
        errorCode: "unknown_outcome",
        errorMessage: "Process stopped after the request was started; the provider may have processed and billed it. Not retried automatically.",
        completedAt: now,
      },
    });
    return count === 1;
  },

  async completeSample(resultId, r, now) {
    await prisma.promptRunResult.update({
      where: { id: resultId },
      data: {
        status: r.status,
        callState: r.callState,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        groundingMode: r.groundingMode,
        searchSettings: json(r.searchSettings),
        model: r.model,
        promptVersion: r.promptVersion,
        extractorVersion: r.extractorVersion,
        configFingerprint: r.configFingerprint,
        mentioned: r.mentioned,
        position: r.position,
        positionStatus: r.positionStatus,
        citedUrls: r.citedUrls,
        citedDomains: r.citedDomains,
        namedBusinesses: r.namedBusinesses,
        competitorIdsMentioned: r.competitorIdsMentioned,
        matchEvidence: json(r.matchEvidence),
        detectorVersion: r.detectorVersion,
        answerText: r.answerText,
        rawResponse: json(r.rawResponse),
        ...(r.providerRequestId ? { providerRequestId: r.providerRequestId } : {}),
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        searchCalls: r.searchCalls,
        costUsd: r.costUsd,
        costSource: r.costSource,
        latencyMs: r.latencyMs,
        completedAt: now,
      },
    });
  },

  async listCycleResults(cycleId) {
    const rows = await prisma.promptRunResult.findMany({ where: { cycleId } });
    return rows.map(toResultForMetrics);
  },

  async finishCycle(cycleId, { status, summary, metricsVersion, unknownOutcomes, estimatedCostUsd, now }) {
    await prisma.monitoringCycle.update({
      where: { id: cycleId },
      data: { status, summary: summary as unknown as Prisma.InputJsonValue, metricsVersion, unknownOutcomes, estimatedCostUsd, completedAt: now },
    });
  },
};
