/**
 * Prisma implementation of the tracking store + dashboard/editor queries.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import type { ClaimOutcome, CycleRecord, TrackingStore } from "./cycle";
import type { CompetitorRef, ResultForMetrics } from "./types";

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toCycleRecord(row: { id: string; status: string; promptIds: unknown; providers: unknown; competitors: unknown }): CycleRecord {
  return {
    id: row.id,
    status: row.status,
    promptIds: strArr(row.promptIds),
    providers: strArr(row.providers),
    competitors: Array.isArray(row.competitors) ? (row.competitors as CompetitorRef[]) : [],
  };
}

export function toResultForMetrics(r: {
  trackedPromptId: string;
  provider: string;
  status: string;
  mentioned: boolean | null;
  position: number | null;
  citedDomains: unknown;
  namedBusinesses: unknown;
  competitorIdsMentioned: unknown;
}): ResultForMetrics {
  return {
    trackedPromptId: r.trackedPromptId,
    provider: r.provider,
    status: r.status,
    mentioned: r.mentioned,
    position: r.position,
    citedDomains: strArr(r.citedDomains),
    namedBusinesses: strArr(r.namedBusinesses),
    competitorIdsMentioned: strArr(r.competitorIdsMentioned),
  };
}

export const prismaTrackingStore: TrackingStore = {
  async getOrCreateCycle({ subscriptionId, cycleKey, trigger, promptIds, providers, competitors, now }) {
    try {
      const row = await prisma.monitoringCycle.create({
        data: { subscriptionId, cycleKey, trigger, status: "running", promptIds, providers, competitors, startedAt: now },
      });
      return { cycle: toCycleRecord(row), created: true };
    } catch (err) {
      if (!isUnique(err)) throw err;
      const row = await prisma.monitoringCycle.findUniqueOrThrow({ where: { subscriptionId_cycleKey: { subscriptionId, cycleKey } } });
      return { cycle: toCycleRecord(row), created: false };
    }
  },

  async getPromptTexts(promptIds) {
    const rows = await prisma.trackedPrompt.findMany({ where: { id: { in: promptIds } }, select: { id: true, text: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return promptIds.map((id) => byId.get(id)).filter((r): r is { id: string; text: string } => !!r);
  },

  async claimResult({ cycleId, trackedPromptId, provider, subscriptionId, now, staleBefore }): Promise<ClaimOutcome> {
    try {
      const row = await prisma.promptRunResult.create({
        data: {
          cycleId, trackedPromptId, provider, subscriptionId, status: "pending", claimedAt: now,
          citedUrls: [], citedDomains: [], namedBusinesses: [], competitorIdsMentioned: [],
        },
        select: { id: true },
      });
      return { state: "claimed", resultId: row.id };
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
    const existing = await prisma.promptRunResult.findUniqueOrThrow({
      where: { cycleId_trackedPromptId_provider: { cycleId, trackedPromptId, provider } },
      select: { id: true, status: true },
    });
    if (existing.status !== "pending") return { state: "done" };
    // Re-claim a pending row only if its claimer looks dead (atomic).
    const { count } = await prisma.promptRunResult.updateMany({
      where: { id: existing.id, status: "pending", claimedAt: { lt: staleBefore } },
      data: { claimedAt: now, errorCode: "stale_claim" },
    });
    return count === 1 ? { state: "claimed", resultId: existing.id } : { state: "in_progress" };
  },

  async completeResult(resultId, r, now) {
    await prisma.promptRunResult.update({
      where: { id: resultId },
      data: {
        status: r.status,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        groundingMode: r.groundingMode,
        model: r.model,
        mentioned: r.mentioned,
        position: r.position,
        citedUrls: r.citedUrls,
        citedDomains: r.citedDomains,
        namedBusinesses: r.namedBusinesses,
        competitorIdsMentioned: r.competitorIdsMentioned,
        matchEvidence: r.matchEvidence ?? Prisma.JsonNull,
        detectorVersion: r.detectorVersion,
        answerText: r.answerText,
        latencyMs: r.latencyMs,
        completedAt: now,
      },
    });
  },

  async listCycleResults(cycleId) {
    const rows = await prisma.promptRunResult.findMany({ where: { cycleId } });
    return rows.map(toResultForMetrics);
  },

  async finishCycle(cycleId, { status, summary, metricsVersion, now }) {
    await prisma.monitoringCycle.update({
      where: { id: cycleId },
      data: { status, summary: summary as unknown as Prisma.InputJsonValue, metricsVersion, completedAt: now },
    });
  },
};
