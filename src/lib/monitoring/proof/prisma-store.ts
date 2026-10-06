/**
 * Proof Engine v1 — Prisma implementations. Every query filters by
 * subscriptionId; lifecycle writes are conditional (updateMany with the
 * expected current state) so the database enforces the same rules as the
 * pure decide* functions.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeDomain } from "@/lib/business/normalize-domain";
import { toResultForMetrics } from "../tracking/prisma-store";
import type { CompetitorRef } from "../tracking/types";
import type { CycleSnapshot, ProofResult } from "./compare";
import { providerSources, type RunRow } from "./evidence";
import { canRecordAssessment, type Assessment, type ExperimentOutcome, type ExperimentRecord, type ExperimentStore } from "./experiment";
import { planActivationSync, toItemRows, type QuestionIntent, type QuestionSetRecord, type QuestionSetStatus, type QuestionSetStore } from "./question-set";
import type { ProofDataSource } from "./types";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

type SetRow = Prisma.TrackingQuestionSetGetPayload<{ include: { items: true } }>;
function toSet(r: SetRow): QuestionSetRecord {
  return {
    id: r.id, subscriptionId: r.subscriptionId, version: r.version, status: r.status as QuestionSetStatus,
    businessCategory: r.businessCategory, city: r.city, state: r.state, serviceArea: r.serviceArea,
    generatorVersion: r.generatorVersion, notes: r.notes, createdAt: r.createdAt, approvedAt: r.approvedAt, approvedBy: r.approvedBy,
    activatedAt: r.activatedAt, firstMeasuredAt: r.firstMeasuredAt, retiredAt: r.retiredAt,
    items: [...r.items].sort((a, b) => a.position - b.position).map((i) => ({
      id: i.id, position: i.position, text: i.text, normalizedText: i.normalizedText, intent: i.intent as QuestionIntent,
      rationale: i.rationale, trackedPromptId: i.trackedPromptId,
    })),
  };
}

export const prismaQuestionSetStore: QuestionSetStore = {
  async listSets(subscriptionId) {
    const rows = await prisma.trackingQuestionSet.findMany({ where: { subscriptionId }, include: { items: true }, orderBy: { version: "desc" } });
    return rows.map(toSet);
  },
  async getSet(subscriptionId, setId) {
    const r = await prisma.trackingQuestionSet.findFirst({ where: { id: setId, subscriptionId }, include: { items: true } });
    return r ? toSet(r) : null;
  },
  async activeSet(subscriptionId) {
    const r = await prisma.trackingQuestionSet.findFirst({ where: { subscriptionId, status: "active" }, include: { items: true } });
    return r ? toSet(r) : null;
  },
  async createDraft(subscriptionId, context, items, now) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const max = await prisma.trackingQuestionSet.aggregate({ where: { subscriptionId }, _max: { version: true } });
      try {
        const r = await prisma.trackingQuestionSet.create({
          data: {
            subscriptionId, version: (max._max.version ?? 0) + 1, status: "draft", createdAt: now, ...context,
            items: { create: toItemRows(items).map((i) => ({ position: i.position, text: i.text, normalizedText: i.normalizedText, intent: i.intent, rationale: i.rationale })) },
          },
          include: { items: true },
        });
        return toSet(r);
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002" || attempt === 2) throw err;
      }
    }
    throw new Error("could not allocate a question-set version");
  },
  async replaceDraftItems(subscriptionId, setId, items) {
    return prisma.$transaction(async (tx) => {
      const set = await tx.trackingQuestionSet.findFirst({ where: { id: setId, subscriptionId, status: "draft", firstMeasuredAt: null } });
      if (!set) return false;
      await tx.trackingQuestionSetItem.deleteMany({ where: { questionSetId: setId } });
      await tx.trackingQuestionSetItem.createMany({
        data: toItemRows(items).map((i) => ({ questionSetId: setId, position: i.position, text: i.text, normalizedText: i.normalizedText, intent: i.intent, rationale: i.rationale })),
      });
      return true;
    });
  },
  async approve(subscriptionId, setId, by, now) {
    const r = await prisma.trackingQuestionSet.updateMany({ where: { id: setId, subscriptionId, status: "draft" }, data: { status: "approved", approvedAt: now, approvedBy: by } });
    return r.count === 1;
  },
  async activate(subscriptionId, setId, now) {
    return prisma.$transaction(async (tx) => {
      const set = await tx.trackingQuestionSet.findFirst({ where: { id: setId, subscriptionId, status: "approved" }, include: { items: true } });
      if (!set) return false;
      await tx.trackingQuestionSet.updateMany({ where: { subscriptionId, status: "active" }, data: { status: "retired", retiredAt: now } });
      const prompts = await tx.trackedPrompt.findMany({ where: { subscriptionId }, select: { id: true, normalizedText: true, isActive: true } });
      const sync = planActivationSync(set.items, prompts);
      if (sync.deactivate.length) await tx.trackedPrompt.updateMany({ where: { id: { in: sync.deactivate }, subscriptionId }, data: { isActive: false, deactivatedAt: now } });
      const linkByText = new Map<string, string>();
      for (const l of sync.link) {
        if (l.reactivate) await tx.trackedPrompt.updateMany({ where: { id: l.trackedPromptId, subscriptionId }, data: { isActive: true, deactivatedAt: null } });
        linkByText.set(l.itemNormalizedText, l.trackedPromptId);
      }
      for (const c of sync.create) {
        const p = await tx.trackedPrompt.create({ data: { subscriptionId, text: c.text, normalizedText: c.normalizedText, source: "custom", isActive: true, createdAt: now }, select: { id: true } });
        linkByText.set(c.normalizedText, p.id);
      }
      for (const item of set.items) {
        await tx.trackingQuestionSetItem.update({ where: { id: item.id }, data: { trackedPromptId: linkByText.get(item.normalizedText) ?? null } });
      }
      const r = await tx.trackingQuestionSet.updateMany({ where: { id: setId, subscriptionId, status: "approved" }, data: { status: "active", activatedAt: now } });
      return r.count === 1;
    });
  },
  async markFirstMeasured(subscriptionId, setId, now) {
    await prisma.trackingQuestionSet.updateMany({ where: { id: setId, subscriptionId, firstMeasuredAt: null }, data: { firstMeasuredAt: now } });
  },
};

type ExpRow = Prisma.ProofExperimentGetPayload<object>;
function toExp(r: ExpRow): ExperimentRecord {
  return { ...r, outcome: (r.outcome as ExperimentOutcome | null) ?? null };
}

export const prismaExperimentStore: ExperimentStore = {
  async list(subscriptionId) {
    return (await prisma.proofExperiment.findMany({ where: { subscriptionId }, orderBy: { createdAt: "desc" } })).map(toExp);
  },
  async get(subscriptionId, id) {
    const r = await prisma.proofExperiment.findFirst({ where: { id, subscriptionId } });
    return r ? toExp(r) : null;
  },
  async findByTask(subscriptionId, improvementTaskId) {
    const r = await prisma.proofExperiment.findFirst({ where: { improvementTaskId, subscriptionId } });
    return r ? toExp(r) : null;
  },
  async create(data, now) {
    const r = await prisma.proofExperiment.create({ data: { ...data, findingEvidence: data.findingEvidence as Prisma.InputJsonValue, createdAt: now } });
    return toExp(r);
  },
  async recordAssessment(subscriptionId, id, a: Assessment, now) {
    const current = await prisma.proofExperiment.findFirst({ where: { id, subscriptionId }, select: { outcome: true } });
    if (!current || !canRecordAssessment((current.outcome as ExperimentOutcome | null) ?? null)) return false;
    const r = await prisma.proofExperiment.updateMany({
      where: { id, subscriptionId, outcome: current.outcome },
      data: {
        outcome: a.outcome, outcomeReason: a.reason, outcomeVersion: a.outcomeVersion, followUpCycleId: a.followUpCycleId,
        assessment: a as unknown as Prisma.InputJsonValue, assessedAt: now,
      },
    });
    return r.count === 1;
  },
};

const RESULT_SELECT = {
  id: true, trackedPromptId: true, provider: true, sampleIndex: true, status: true, callState: true, mentioned: true, position: true,
  positionStatus: true, configFingerprint: true, citedDomains: true, namedBusinesses: true, competitorIdsMentioned: true, costUsd: true,
  rawResponse: true,
} as const;

type CycleRow = Prisma.MonitoringCycleGetPayload<{ include: { results: { select: typeof RESULT_SELECT } } }>;
function toSnapshot(c: CycleRow): CycleSnapshot {
  const results: ProofResult[] = c.results.map((r) => ({
    ...toResultForMetrics(r),
    nativeCitationDomains: [...new Set(providerSources(r.rawResponse).map((s) => s.domain).filter((d): d is string => !!d))],
  }));
  return {
    id: c.id, startedAt: c.startedAt, status: c.status, questionSetId: c.questionSetId, questionSetVersion: c.questionSetVersion,
    providers: strArr(c.providers), samplesPerPrompt: c.samplesPerPrompt,
    competitors: Array.isArray(c.competitors) ? (c.competitors as CompetitorRef[]) : [], results,
  };
}
const DONE = ["completed", "partial"];
const withResults = { results: { select: RESULT_SELECT } } as const;

export const prismaProofData: ProofDataSource = {
  async getTask(subscriptionId, taskId) {
    return prisma.improvementTask.findFirst({
      where: { id: taskId, subscriptionId },
      select: { id: true, subscriptionId: true, status: true, title: true, proposedFix: true, url: true, implementationUrl: true, category: true, dedupeKey: true, evidence: true, approvedAt: true, implementedAt: true, verifiedAt: true },
    });
  },
  async listTasks(subscriptionId) {
    return prisma.improvementTask.findMany({ where: { subscriptionId, isFixture: false }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, status: true } });
  },
  async latestVerification(subscriptionId, taskId) {
    const v = await prisma.improvementVerification.findFirst({ where: { taskId, task: { subscriptionId } }, orderBy: { createdAt: "desc" } });
    return v ? { outcome: v.outcome, checkedAt: v.checkedAt, url: v.url, expected: v.expected, observed: v.observed } : null;
  },
  async cycleSnapshot(subscriptionId, cycleId) {
    const c = await prisma.monitoringCycle.findFirst({ where: { id: cycleId, subscriptionId }, include: withResults });
    return c ? toSnapshot(c) : null;
  },
  async latestCycleForSet(subscriptionId, setId, version, before) {
    const c = await prisma.monitoringCycle.findFirst({
      where: { subscriptionId, questionSetId: setId, questionSetVersion: version, status: { in: DONE }, ...(before ? { startedAt: { lt: before } } : {}) },
      orderBy: { startedAt: "desc" }, include: withResults,
    });
    return c ? toSnapshot(c) : null;
  },
  async firstCycleForSetAfter(subscriptionId, setId, version, after) {
    const c = await prisma.monitoringCycle.findFirst({
      where: { subscriptionId, questionSetId: setId, questionSetVersion: version, status: { in: DONE }, startedAt: { gt: after } },
      orderBy: { startedAt: "asc" }, include: withResults,
    });
    return c ? toSnapshot(c) : null;
  },
  async latestCycles(subscriptionId, limit) {
    const cs = await prisma.monitoringCycle.findMany({ where: { subscriptionId, status: { in: DONE } }, orderBy: { startedAt: "desc" }, take: limit, include: withResults });
    return cs.map(toSnapshot);
  },
  async runRows(subscriptionId, cycleId): Promise<RunRow[]> {
    return prisma.promptRunResult.findMany({
      where: { cycleId, subscriptionId },
      orderBy: [{ trackedPromptId: "asc" }, { provider: "asc" }, { sampleIndex: "asc" }],
      select: {
        id: true, trackedPromptId: true, provider: true, sampleIndex: true, model: true, status: true, callState: true, errorCode: true, errorMessage: true,
        groundingMode: true, answerText: true, mentioned: true, position: true, positionStatus: true, namedBusinesses: true, competitorIdsMentioned: true,
        citedUrls: true, rawResponse: true, matchEvidence: true, claimedAt: true, completedAt: true,
      },
    });
  },
  async promptTexts(subscriptionId) {
    return prisma.trackedPrompt.findMany({ where: { subscriptionId }, select: { id: true, text: true } });
  },
  async competitorNames(subscriptionId) {
    const rows = await prisma.trackedCompetitor.findMany({ where: { subscriptionId }, select: { id: true, name: true } });
    return Object.fromEntries(rows.map((r) => [r.id, r.name]));
  },
  async auditScores(subscriptionId, around) {
    const sub = await prisma.monitoringSubscription.findUnique({ where: { id: subscriptionId }, select: { baselineAuditOrderId: true } });
    const rows = await prisma.auditOrder.findMany({
      where: {
        reportStatus: "generated", reviewStatus: "approved",
        OR: [{ monitoringSubscriptionId: subscriptionId }, ...(sub?.baselineAuditOrderId ? [{ id: sub.baselineAuditOrderId }] : [])],
      },
      select: { reportGeneratedAt: true, createdAt: true, intelligence: { select: { overallScore: true } } },
    });
    const points = rows
      .map((r) => ({ at: r.reportGeneratedAt ?? r.createdAt, score: r.intelligence?.overallScore ?? null }))
      .filter((p): p is { at: Date; score: number } => typeof p.score === "number")
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const before = [...points].reverse().find((p) => p.at < around) ?? null;
    const after = points.find((p) => p.at > around) ?? null;
    return { baseline: before, followUp: after };
  },
  async websiteChanges(subscriptionId, from, to) {
    const sub = await prisma.monitoringSubscription.findUnique({ where: { id: subscriptionId }, select: { websiteUrl: true } });
    const domain = normalizeDomain(sub?.websiteUrl ?? "");
    const rows = await prisma.websiteChange.findMany({
      where: { subscriptionId, siteKind: "customer", isFixture: false, toFetchedAt: { gte: from, lte: to }, ...(domain ? { siteDomain: domain } : {}) },
      orderBy: { toFetchedAt: "asc" }, take: 20,
      select: { changeType: true, url: true, beforeExcerpt: true, afterExcerpt: true, toFetchedAt: true },
    });
    return rows.map((r) => ({ changeType: r.changeType, url: r.url, beforeExcerpt: r.beforeExcerpt, afterExcerpt: r.afterExcerpt, detectedAt: r.toFetchedAt }));
  },
};

export const prismaProofStores = { questionSets: prismaQuestionSetStore, experiments: prismaExperimentStore, data: prismaProofData };
