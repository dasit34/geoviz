/**
 * Database-backed tracking operations used by routes, pages, the
 * scheduler, and the staging trigger. All rules live in the pure modules;
 * this file only loads/saves.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";
import { prisma } from "@/lib/db";

import { monitoringAccess } from "../access";
import { entitlementsForPlan } from "../plans";
import type { MonitoringSubscriptionRecord } from "../types";
import { buildCitationIntel } from "./citation-intel";
import { decideCompetitorAdd, detectCompetitors } from "./competitors";
import { runMonitoringCycle, type RunCycleResult } from "./cycle";
import { buildEntityMatcher } from "./detector";
import { compareCycles, computeCycleMetrics, type CycleMetrics } from "./metrics";
import { prismaTrackingStore, toResultForMetrics } from "./prisma-store";
import { decidePromptAdd, extractSuggestionContext, suggestPrompts } from "./prompts";
import { buildRecommendations, issuesFromDeterministicScore } from "./recommendations";
import type { CompetitorRef, TrackingProviderRunner } from "./types";

export function customerMatcherFor(sub: Pick<MonitoringSubscriptionRecord, "businessName" | "websiteUrl">) {
  return buildEntityMatcher({ id: "customer", name: sub.businessName || normalizeDomain(sub.websiteUrl) || sub.websiteUrl, websiteUrl: sub.websiteUrl });
}

/** Editing is allowed only while the subscription is paid up; otherwise read-only. */
export function canEditTracking(sub: MonitoringSubscriptionRecord, now = new Date()): boolean {
  return monitoringAccess(sub, now).schedulingEnabled;
}

export type MutationResult = { ok: true } | { ok: false; message: string };

export async function addTrackedPrompt(sub: MonitoringSubscriptionRecord, text: string, source: "custom" | "suggested"): Promise<MutationResult> {
  if (!canEditTracking(sub)) return { ok: false, message: "Your subscription isn't active, so tracking is read-only." };
  const active = await prisma.trackedPrompt.findMany({ where: { subscriptionId: sub.id, isActive: true }, select: { normalizedText: true } });
  const d = decidePromptAdd({ text, activeNormalized: active.map((a) => a.normalizedText), entitlements: entitlementsForPlan(sub.planKey) });
  if (!d.ok) return { ok: false, message: d.message };
  // Re-activating a previously removed identical question keeps its history.
  await prisma.trackedPrompt.upsert({
    where: { subscriptionId_normalizedText: { subscriptionId: sub.id, normalizedText: d.normalizedText } },
    create: { subscriptionId: sub.id, text: d.text, normalizedText: d.normalizedText, source },
    update: { isActive: true, deactivatedAt: null },
  });
  return { ok: true };
}

export async function deactivateTrackedPrompt(sub: MonitoringSubscriptionRecord, promptId: string): Promise<MutationResult> {
  if (!canEditTracking(sub)) return { ok: false, message: "Your subscription isn't active, so tracking is read-only." };
  const { count } = await prisma.trackedPrompt.updateMany({ where: { id: promptId, subscriptionId: sub.id, isActive: true }, data: { isActive: false, deactivatedAt: new Date() } });
  return count === 1 ? { ok: true } : { ok: false, message: "Question not found." };
}

export async function addTrackedCompetitor(
  sub: MonitoringSubscriptionRecord,
  name: string,
  websiteUrl: string | null,
  source: "customer" | "detected",
): Promise<MutationResult> {
  if (!canEditTracking(sub)) return { ok: false, message: "Your subscription isn't active, so tracking is read-only." };
  const active = await prisma.trackedCompetitor.findMany({ where: { subscriptionId: sub.id, isActive: true }, select: { normalizedName: true } });
  const d = decideCompetitorAdd({
    name,
    websiteUrl,
    activeNormalized: active.map((a) => a.normalizedName),
    entitlements: entitlementsForPlan(sub.planKey),
    customer: customerMatcherFor(sub),
  });
  if (!d.ok) return { ok: false, message: d.message };
  await prisma.trackedCompetitor.upsert({
    where: { subscriptionId_normalizedName: { subscriptionId: sub.id, normalizedName: d.normalizedName } },
    create: { subscriptionId: sub.id, name: d.name, normalizedName: d.normalizedName, websiteUrl: d.websiteUrl, domain: d.domain, source },
    update: { isActive: true, deactivatedAt: null, ...(d.websiteUrl ? { websiteUrl: d.websiteUrl, domain: d.domain } : {}) },
  });
  return { ok: true };
}

export async function deactivateTrackedCompetitor(sub: MonitoringSubscriptionRecord, competitorId: string): Promise<MutationResult> {
  if (!canEditTracking(sub)) return { ok: false, message: "Your subscription isn't active, so tracking is read-only." };
  const { count } = await prisma.trackedCompetitor.updateMany({ where: { id: competitorId, subscriptionId: sub.id, isActive: true }, data: { isActive: false, deactivatedAt: new Date() } });
  return count === 1 ? { ok: true } : { ok: false, message: "Competitor not found." };
}

async function activeCompetitorRefs(subscriptionId: string): Promise<CompetitorRef[]> {
  const rows = await prisma.trackedCompetitor.findMany({ where: { subscriptionId, isActive: true }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, normalizedName: r.normalizedName, domain: r.domain }));
}

/** Run (or resume) one tracking cycle for a subscription. */
export async function runTrackingCycleForSubscription(
  sub: MonitoringSubscriptionRecord,
  opts: { cycleKey: string; trigger: "scheduler" | "manual"; runner: TrackingProviderRunner },
): Promise<RunCycleResult> {
  const ent = entitlementsForPlan(sub.planKey);
  if (ent.maxActivePrompts <= 0) return { outcome: "skipped", reason: "plan has no prompt tracking" };
  const prompts = await prisma.trackedPrompt.findMany({
    where: { subscriptionId: sub.id, isActive: true },
    orderBy: { createdAt: "asc" },
    take: ent.maxActivePrompts,
    select: { id: true },
  });
  const competitors = ent.maxCompetitors > 0 ? (await activeCompetitorRefs(sub.id)).slice(0, ent.maxCompetitors) : [];
  return runMonitoringCycle({
    store: prismaTrackingStore,
    runner: opts.runner,
    subject: { subscriptionId: sub.id, businessName: sub.businessName, websiteUrl: sub.websiteUrl, customerDomain: normalizeDomain(sub.websiteUrl) },
    activePrompts: prompts,
    activeCompetitors: competitors,
    providers: ent.providers,
    cycleKey: opts.cycleKey,
    trigger: opts.trigger,
    now: () => new Date(),
  });
}

/** Everything the tracking tabs of the status page need. */
export async function loadTrackingDashboard(sub: MonitoringSubscriptionRecord) {
  const ent = entitlementsForPlan(sub.planKey);
  const customerDomain = normalizeDomain(sub.websiteUrl);
  const customer = customerMatcherFor(sub);

  const [prompts, competitors, cycles] = await Promise.all([
    prisma.trackedPrompt.findMany({ where: { subscriptionId: sub.id, isActive: true }, orderBy: { createdAt: "asc" } }),
    prisma.trackedCompetitor.findMany({ where: { subscriptionId: sub.id, isActive: true }, orderBy: { createdAt: "asc" } }),
    prisma.monitoringCycle.findMany({
      where: { subscriptionId: sub.id, status: { in: ["completed", "partial"] } },
      orderBy: { startedAt: "desc" },
      take: 12,
      select: { id: true, startedAt: true, status: true, summary: true, competitors: true },
    }),
  ]);
  const competitorRefs: CompetitorRef[] = competitors.map((c) => ({ id: c.id, name: c.name, normalizedName: c.normalizedName, domain: c.domain }));

  const [latestCycle, previousCycle] = cycles;
  const [latestRows, previousRows] = await Promise.all([
    latestCycle ? prisma.promptRunResult.findMany({ where: { cycleId: latestCycle.id } }) : Promise.resolve([]),
    previousCycle ? prisma.promptRunResult.findMany({ where: { cycleId: previousCycle.id } }) : Promise.resolve([]),
  ]);
  const latestResults = latestRows.map(toResultForMetrics);
  const cycleCompetitors = latestCycle && Array.isArray(latestCycle.competitors) ? (latestCycle.competitors as CompetitorRef[]) : competitorRefs;

  const metrics: CycleMetrics | null = latestCycle ? computeCycleMetrics(latestResults, customerDomain, cycleCompetitors) : null;
  const comparison = latestCycle && previousCycle
    ? compareCycles(previousRows.map(toResultForMetrics), latestResults, customerDomain, cycleCompetitors)
    : null;
  const citations = ent.citationTracking && latestCycle ? buildCitationIntel(latestResults, customerDomain, cycleCompetitors) : null;
  const detected = detectCompetitors(latestResults, customer, competitors.map((c) => c.normalizedName));

  // Latest reviewed audit — evidence for recommendations + suggestion context.
  const latestAudit = await prisma.auditOrder.findFirst({
    where: {
      reportStatus: "generated",
      reviewStatus: "approved",
      OR: [{ monitoringSubscriptionId: sub.id }, ...(sub.baselineAuditOrderId ? [{ id: sub.baselineAuditOrderId }] : [])],
    },
    orderBy: { createdAt: "desc" },
    select: { reportGeneratedAt: true, createdAt: true, intelligence: { select: { deterministicScore: true, aiValidations: true, industryCategoryNormalized: true } } },
  });

  const suggestions = suggestPrompts(
    extractSuggestionContext({
      businessName: sub.businessName || customerDomain || "",
      industrySlug: latestAudit?.intelligence?.industryCategoryNormalized ?? null,
      aiValidations: latestAudit?.intelligence?.aiValidations ?? null,
    }),
    prompts.map((p) => p.normalizedText),
  );

  const recommendations = buildRecommendations({
    audit: latestAudit?.intelligence
      ? { completedAt: latestAudit.reportGeneratedAt ?? latestAudit.createdAt, issues: issuesFromDeterministicScore(latestAudit.intelligence.deterministicScore) }
      : null,
    metrics,
    citations,
    detectedCompetitors: detected,
    customerName: sub.businessName || customerDomain || "Your business",
  });

  const promptText = new Map(prompts.map((p) => [p.id, p.text]));
  const latestByPrompt = new Map<string, typeof latestRows>();
  for (const r of latestRows) latestByPrompt.set(r.trackedPromptId, [...(latestByPrompt.get(r.trackedPromptId) ?? []), r]);

  return {
    entitlements: ent,
    canEdit: canEditTracking(sub),
    prompts: prompts.map((p) => ({ id: p.id, text: p.text, source: p.source, results: latestByPrompt.get(p.id) ?? [] })),
    competitors: competitors.map((c) => ({ id: c.id, name: c.name, websiteUrl: c.websiteUrl, source: c.source })),
    detectedCompetitors: detected,
    suggestions,
    latestCycle: latestCycle ? { id: latestCycle.id, startedAt: latestCycle.startedAt, status: latestCycle.status } : null,
    cycleHistory: cycles.map((c) => ({ id: c.id, startedAt: c.startedAt, status: c.status, summary: c.summary as CycleMetrics | null })),
    metrics,
    comparison,
    citations,
    recommendations,
    promptText,
  };
}
