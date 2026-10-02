/**
 * Database-backed improvement-task operations. Rules live in the pure
 * modules (workflow, facts, drafts, expectations, verify, impact). Every
 * customer read/write is scoped to the token's subscription id; writes
 * also require an active subscription (canEditTracking).
 */
import { Prisma } from "@prisma/client";

import { normalizeDomain } from "@/lib/business/normalize-domain";
import { prisma } from "@/lib/db";

import { toResultForMetrics } from "../tracking/prisma-store";
import type { Recommendation } from "../tracking/recommendations";
import { canEditTracking, loadTrackingDashboard, type MutationResult } from "../tracking/service";
import type { CompetitorRef } from "../tracking/types";
import type { MonitoringSubscriptionRecord } from "../types";
import { loadWebsiteDashboard } from "../website/service";
import { generateDraft, GENERATOR_VERSION, type Expectation, type ObservedPage } from "./drafts";
import { checkUrlFor, describeExpected } from "./expectations";
import { parseFacts, suggestFactsFromObserved, validateFacts, type BusinessFacts } from "./facts";
import { buildImpact, type CycleForImpact } from "./impact";
import { sameSiteUrl, untrustedText } from "./sanitize";
import { canTransition, decideCreate, isOpen, openKeyFor, seedFromRecommendation, type Actor, type FixKind, type TaskStatus } from "./workflow";

const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const READ_ONLY: MutationResult = { ok: false, message: "Your subscription isn't active, so improvements are read-only." };

type Sub = MonitoringSubscriptionRecord;

/** Recommendations recomputed server-side (never trusted from the client). */
export async function currentRecommendations(sub: Sub): Promise<{ recommendations: Recommendation[]; tracking: Awaited<ReturnType<typeof loadTrackingDashboard>> }> {
  const website = await loadWebsiteDashboard(sub);
  const tracking = await loadTrackingDashboard(sub, { websiteFindings: website.findings });
  return { recommendations: tracking.recommendations, tracking };
}

export async function latestFactSheet(subscriptionId: string): Promise<{ facts: BusinessFacts; version: number; confirmedBy: string; createdAt: Date } | null> {
  const row = await prisma.businessFactSheet.findFirst({ where: { subscriptionId }, orderBy: { version: "desc" } });
  return row ? { facts: parseFacts(row.facts), version: row.version, confirmedBy: row.confirmedBy, createdAt: row.createdAt } : null;
}

export async function saveFacts(sub: Sub, input: Record<string, string | undefined>, actor: "customer" | "operator"): Promise<MutationResult> {
  if (actor === "customer" && !canEditTracking(sub)) return READ_ONLY;
  const v = validateFacts(input);
  if (!v.ok) return v;
  for (let i = 0; i < 3; i += 1) {
    const last = await prisma.businessFactSheet.findFirst({ where: { subscriptionId: sub.id }, orderBy: { version: "desc" }, select: { version: true } });
    try {
      await prisma.businessFactSheet.create({ data: { subscriptionId: sub.id, version: (last?.version ?? 0) + 1, facts: json(v.facts), confirmedBy: actor } });
      return { ok: true };
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  return { ok: false, message: "Please try again." };
}

/** Latest successful real snapshot of a page on the customer's site (untrusted). */
async function observedPage(sub: Sub, url: string | null): Promise<ObservedPage | null> {
  const domain = normalizeDomain(sub.websiteUrl);
  if (!domain) return null;
  const scan = await prisma.websiteScan.findFirst({ where: { subscriptionId: sub.id, siteDomain: domain, isFixture: false, status: { in: ["completed", "partial"] } }, orderBy: { completedAt: "desc" }, select: { id: true } });
  if (!scan) return null;
  const pages = await prisma.pageSnapshot.findMany({ where: { scanId: scan.id, fetchStatus: "ok" } });
  const key = url ? url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase() : null;
  const page = pages.find((p) => key && p.normalizedUrl.replace(/\/+$/, "") === key) ?? pages.find((p) => p.discoveredVia === "homepage") ?? null;
  if (!page) return null;
  const sd = (page.structuredData ?? {}) as { types?: unknown };
  return { url: page.url, title: page.title, description: page.metaDescription, identity: (page.identity as ObservedPage["identity"]) ?? null, schemaTypes: strArr(sd.types) };
}

async function draftContext(sub: Sub) {
  const [facts, prompts, audit] = await Promise.all([
    latestFactSheet(sub.id),
    prisma.trackedPrompt.findMany({ where: { subscriptionId: sub.id, isActive: true }, orderBy: { createdAt: "asc" }, select: { text: true } }),
    prisma.auditOrder.findFirst({
      where: { reportStatus: "generated", OR: [{ monitoringSubscriptionId: sub.id }, ...(sub.baselineAuditOrderId ? [{ id: sub.baselineAuditOrderId }] : [])] },
      orderBy: { createdAt: "desc" },
      select: { intelligence: { select: { industryCategoryNormalized: true } } },
    }),
  ]);
  return { facts, trackedQuestions: prompts.map((p) => p.text), industrySlug: audit?.intelligence?.industryCategoryNormalized ?? null };
}

async function buildDraftFor(sub: Sub, task: { fixKind: string; dedupeKey: string; url: string | null }, citationSources: Array<{ domain: string; answers: number }>) {
  const ctx = await draftContext(sub);
  const observed = await observedPage(sub, task.url);
  const removed = task.fixKind === "restore_page" && task.url
    ? await prisma.websiteChange.findFirst({ where: { subscriptionId: sub.id, changeType: "page_removed", url: task.url, isFixture: false }, orderBy: { toFetchedAt: "desc" }, select: { beforeExcerpt: true } })
    : null;
  const draft = generateDraft({
    fixKind: task.fixKind as FixKind,
    dedupeKey: task.dedupeKey,
    taskUrl: task.url,
    siteUrl: sub.websiteUrl,
    facts: ctx.facts?.facts ?? null,
    industrySlug: ctx.industrySlug,
    trackedQuestions: ctx.trackedQuestions,
    citationSources,
    observed,
    removedPageTitle: removed?.beforeExcerpt ?? null,
  });
  return { draft, factSheetVersion: ctx.facts?.version ?? null };
}

const citationSourcesFrom = (tracking: Awaited<ReturnType<typeof loadTrackingDashboard>>) =>
  (tracking.citations?.opportunities ?? []).map((o) => ({ domain: o.domain, answers: o.answers }));

/** Create (or record a recurrence of) a task from a recommendation id. */
export async function createTaskFromRecommendation(sub: Sub, recommendationId: string, actor: "customer" | "operator"): Promise<MutationResult & { taskId?: string }> {
  if (actor === "customer" && !canEditTracking(sub)) return READ_ONLY;
  const { recommendations, tracking } = await currentRecommendations(sub);
  const rec = recommendations.find((r) => r.id === recommendationId);
  if (!rec) return { ok: false, message: "That finding is no longer current." };
  const now = new Date();
  const seed = seedFromRecommendation(rec, now);
  const existing = await prisma.improvementTask.findMany({ where: { subscriptionId: sub.id, dedupeKey: seed.dedupeKey }, select: { id: true, status: true, dismissedAt: true, lastSeenAt: true } });
  const decision = decideCreate({ seed, existing: existing.map((e) => ({ ...e, status: e.status as TaskStatus })), evidenceObservedAt: now });
  if (decision.action === "skip") return { ok: false, message: decision.reason, taskId: decision.taskId };
  if (decision.action === "recurrence") {
    await recordRecurrence(decision.taskId, decision.evidence, now);
    return { ok: true, taskId: decision.taskId };
  }
  const { draft, factSheetVersion } = await buildDraftFor(sub, { fixKind: seed.fixKind, dedupeKey: seed.dedupeKey, url: seed.url }, citationSourcesFrom(tracking));
  try {
    const task = await prisma.improvementTask.create({
      data: {
        subscriptionId: sub.id,
        dedupeKey: seed.dedupeKey,
        openKey: openKeyFor(sub.id, seed.dedupeKey),
        source: seed.source,
        category: seed.category,
        fixKind: seed.fixKind,
        title: untrustedText(seed.title, 200),
        problem: untrustedText(seed.problem, 400),
        evidence: json(seed.evidence),
        url: seed.url,
        priority: seed.priority,
        priorityReason: seed.priorityReason,
        proposedFix: untrustedText(seed.proposedFix, 800),
        verificationMethod: seed.verificationMethod,
        expectation: json(draft.expectation),
        events: { create: [{ actor, type: "created", toStatus: "suggested", note: `Created from finding: ${untrustedText(rec.title, 200)}` }, { actor: "system", type: "draft_created", note: "Draft version 1" }] },
        drafts: { create: { version: 1, kind: draft.kind, format: draft.format, content: draft.content, missingFacts: json(draft.missingFacts), factSheetVersion, generatorVersion: GENERATOR_VERSION, createdBy: "system" } },
      },
    });
    return { ok: true, taskId: task.id };
  } catch (e) {
    if (!isUnique(e)) throw e;
    // Lost a race to another create: record it as a recurrence on the open task.
    const open = await prisma.improvementTask.findUnique({ where: { openKey: openKeyFor(sub.id, seed.dedupeKey) }, select: { id: true } });
    if (open) await recordRecurrence(open.id, seed.evidence[0]!, now);
    return { ok: true, taskId: open?.id };
  }
}

async function recordRecurrence(taskId: string, evidence: { text: string; url?: string; observedAt?: string }, now: Date) {
  const task = await prisma.improvementTask.findUniqueOrThrow({ where: { id: taskId }, select: { evidence: true } });
  const list = Array.isArray(task.evidence) ? (task.evidence as Array<{ text: string }>) : [];
  const fresh = list.some((e) => e.text === evidence.text) ? list : [...list, evidence].slice(-10);
  await prisma.improvementTask.update({
    where: { id: taskId },
    data: { occurrences: { increment: 1 }, lastSeenAt: now, evidence: json(fresh), events: { create: { actor: "system", type: "recurrence", note: "The same finding was observed again." } } },
  });
}

async function taskFor(subscriptionId: string, taskId: string) {
  return prisma.improvementTask.findFirst({ where: { id: taskId, subscriptionId } });
}

export type TransitionInput = { taskId: string; to: TaskStatus; notes?: string; implementationUrl?: string; reason?: string; evidenceUrl?: string };

/** Status change by the customer (token-scoped) or an operator (admin-authenticated). */
export async function transitionTask(sub: Sub, input: TransitionInput, actor: "customer" | "operator"): Promise<MutationResult> {
  if (actor === "customer" && !canEditTracking(sub)) return READ_ONLY;
  const task = await taskFor(sub.id, input.taskId);
  if (!task) return { ok: false, message: "Task not found." };
  const from = task.status as TaskStatus;
  const d = canTransition({ from, to: input.to, actor, fixKind: task.fixKind as FixKind });
  if (!d.ok) return d;
  const now = new Date();
  const data: Prisma.ImprovementTaskUpdateManyMutationInput = { status: input.to };
  let note = input.notes ? untrustedText(input.notes, 1000) : null;
  let implementationUrl: string | null = task.implementationUrl;

  if (input.to === "approved") data.approvedAt = now;
  if (input.to === "implemented") {
    if (input.implementationUrl) {
      implementationUrl = sameSiteUrl(input.implementationUrl, normalizeDomain(sub.websiteUrl));
      if (!implementationUrl) return { ok: false, message: "Enter a page address on your own website." };
    }
    Object.assign(data, { implementedAt: now, implementedBy: actor, implementationUrl, ...(note ? { implementationNotes: note } : {}) });
  }
  if (input.to === "verified") {
    // Only reachable by operators for manual-only kinds (workflow.canTransition).
    const evidenceUrl = input.evidenceUrl?.trim() ?? "";
    if (!/^https:\/\/\S+$/i.test(evidenceUrl) || !note) return { ok: false, message: "Manual verification needs an https evidence URL and a note." };
    Object.assign(data, { verifiedAt: now, verifiedBy: "operator", openKey: null });
    note = `Operator check: ${note} (${evidenceUrl.slice(0, 300)})`;
  }
  if (input.to === "dismissed") Object.assign(data, { dismissedAt: now, dismissReason: input.reason ? untrustedText(input.reason, 300) : null, openKey: null });
  if (input.to === "suggested" && from === "dismissed") {
    const open = await prisma.improvementTask.findUnique({ where: { openKey: openKeyFor(sub.id, task.dedupeKey) }, select: { id: true } });
    if (open) return { ok: false, message: "There's already an open task for this finding." };
    Object.assign(data, { dismissedAt: null, dismissReason: null, openKey: openKeyFor(sub.id, task.dedupeKey) });
  }

  try {
    const { count } = await prisma.improvementTask.updateMany({ where: { id: task.id, subscriptionId: sub.id, status: from }, data });
    if (count !== 1) return { ok: false, message: "This task changed in the meantime — refresh and try again." };
  } catch (e) {
    if (isUnique(e)) return { ok: false, message: "There's already an open task for this finding." };
    throw e;
  }
  await prisma.improvementEvent.create({ data: { taskId: task.id, actor, type: "status_changed", fromStatus: from, toStatus: input.to, note } });

  if (input.to === "implemented" && task.verificationMethod === "scanner") {
    await queueVerification(sub, task.id, task.isFixture);
  }
  return { ok: true };
}

/** Queue an independent scanner check (no-op for manual tasks or a missing page address). */
export async function queueVerification(sub: Sub, taskId: string, isFixture = false): Promise<MutationResult> {
  const task = await taskFor(sub.id, taskId);
  if (!task) return { ok: false, message: "Task not found." };
  if (task.status !== "implemented") return { ok: false, message: "Only implemented tasks are checked." };
  const expectation = task.expectation as Expectation | null;
  if (!expectation || expectation.type === "manual") return { ok: false, message: "This task is reviewed by an operator." };
  const url = checkUrlFor(expectation, task.implementationUrl);
  if (!url) {
    await prisma.improvementEvent.create({ data: { taskId, actor: "system", type: "verification", note: "Could not verify: add the address of the page you published." } });
    return { ok: false, message: "Add the address of the page you published so we can check it." };
  }
  const pending = await prisma.improvementVerification.count({ where: { taskId, status: { in: ["queued", "running"] } } });
  if (pending > 0) return { ok: true };
  await prisma.improvementVerification.create({ data: { taskId, subscriptionId: sub.id, url, expected: json(expectation), isFixture: isFixture || task.isFixture } });
  return { ok: true };
}

export async function addTaskNote(sub: Sub, taskId: string, note: string, actor: "customer" | "operator"): Promise<MutationResult> {
  if (actor === "customer" && !canEditTracking(sub)) return READ_ONLY;
  const task = await taskFor(sub.id, taskId);
  if (!task) return { ok: false, message: "Task not found." };
  const text = untrustedText(note, 1000);
  if (!text) return { ok: false, message: "Write a note first." };
  await prisma.improvementEvent.create({ data: { taskId, actor, type: "note", note: text } });
  return { ok: true };
}

export async function setTaskOwner(sub: Sub, taskId: string, owner: string): Promise<MutationResult> {
  if (!["customer", "operator", "unassigned"].includes(owner)) return { ok: false, message: "Unknown owner." };
  const task = await taskFor(sub.id, taskId);
  if (!task) return { ok: false, message: "Task not found." };
  await prisma.improvementTask.update({ where: { id: taskId }, data: { owner, events: { create: { actor: "operator", type: "owner_changed", note: `Owner: ${owner}` } } } });
  return { ok: true };
}

/** New immutable draft version from the current facts and observations. */
export async function regenerateDraft(sub: Sub, taskId: string, actor: Actor): Promise<MutationResult> {
  if (actor === "customer" && !canEditTracking(sub)) return READ_ONLY;
  const task = await taskFor(sub.id, taskId);
  if (!task) return { ok: false, message: "Task not found." };
  if (!isOpen(task.status as TaskStatus)) return { ok: false, message: "Closed tasks keep their drafts as they were." };
  const { tracking } = await currentRecommendations(sub);
  const { draft, factSheetVersion } = await buildDraftFor(sub, task, citationSourcesFrom(tracking));
  for (let i = 0; i < 3; i += 1) {
    const last = await prisma.improvementDraft.findFirst({ where: { taskId }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (last?.version ?? 0) + 1;
    try {
      await prisma.$transaction([
        prisma.improvementDraft.create({ data: { taskId, version, kind: draft.kind, format: draft.format, content: draft.content, missingFacts: json(draft.missingFacts), factSheetVersion, generatorVersion: GENERATOR_VERSION, createdBy: actor } }),
        prisma.improvementTask.update({ where: { id: taskId }, data: { expectation: json(draft.expectation) } }),
        prisma.improvementEvent.create({ data: { taskId, actor, type: "draft_created", note: `Draft version ${version}` } }),
      ]);
      return { ok: true };
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  return { ok: false, message: "Please try again." };
}

/** A draft, only if it belongs to this subscription. */
export async function draftForDownload(subscriptionId: string, draftId: string) {
  return prisma.improvementDraft.findFirst({ where: { id: draftId, task: { subscriptionId } }, include: { task: { select: { title: true } } } });
}

async function impactCycles(subscriptionId: string): Promise<CycleForImpact[]> {
  const cycles = await prisma.monitoringCycle.findMany({
    where: { subscriptionId, status: { in: ["completed", "partial", "needs_review"] } },
    orderBy: { startedAt: "desc" },
    take: 12,
    select: { id: true, startedAt: true },
  });
  const rows = await prisma.promptRunResult.findMany({ where: { cycleId: { in: cycles.map((c) => c.id) } } });
  return cycles.map((c) => ({ id: c.id, startedAt: c.startedAt, results: rows.filter((r) => r.cycleId === c.id).map(toResultForMetrics) }));
}

export type ImprovementsDashboard = Awaited<ReturnType<typeof loadImprovementsDashboard>>;

/** Everything the Improvements tab needs (token-scoped). */
export async function loadImprovementsDashboard(sub: Sub, recommendations: Recommendation[]) {
  const competitorRows = await prisma.trackedCompetitor.findMany({ where: { subscriptionId: sub.id, isActive: true }, select: { id: true, name: true, normalizedName: true, domain: true } });
  const competitors: CompetitorRef[] = competitorRows;
  const [tasks, facts, homepage, cycles] = await Promise.all([
    prisma.improvementTask.findMany({
      where: { subscriptionId: sub.id },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: {
        drafts: { orderBy: { version: "desc" } },
        events: { orderBy: { createdAt: "desc" }, take: 30 },
        verifications: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }),
    latestFactSheet(sub.id),
    observedPage(sub, null),
    impactCycles(sub.id),
  ]);
  const customerDomain = normalizeDomain(sub.websiteUrl);
  const openKeys = new Set(tasks.filter((t) => isOpen(t.status as TaskStatus)).map((t) => t.dedupeKey));
  const homepageLocations = homepage
    ? await prisma.pageSnapshot.findFirst({ where: { url: homepage.url, subscriptionId: sub.id }, orderBy: { fetchedAt: "desc" }, select: { locations: true } })
    : null;
  return {
    canEdit: canEditTracking(sub),
    facts,
    factSuggestions: suggestFactsFromObserved({
      businessName: sub.businessName,
      observed: homepage ? { name: homepage.identity?.name ?? null, phone: homepage.identity?.phone ?? null, address: homepage.identity?.address ?? null, locations: strArr(homepageLocations?.locations) } : null,
    }),
    available: recommendations.filter((r) => !openKeys.has(r.id)),
    taskByRecommendation: Object.fromEntries(tasks.filter((t) => isOpen(t.status as TaskStatus)).map((t) => [t.dedupeKey, t.id])),
    tasks: tasks.map((t) => ({
      ...t,
      status: t.status as TaskStatus,
      evidence: (Array.isArray(t.evidence) ? t.evidence : []) as Array<{ text: string; url?: string; observedAt?: string }>,
      expectedText: t.expectation ? describeExpected(t.expectation as Expectation) : null,
      drafts: t.drafts.map((d) => ({ ...d, missingFacts: strArr(d.missingFacts) })),
      verifications: t.verifications.map((v) => {
        const o = (v.observed ?? {}) as { expected?: string; observed?: string };
        return { id: v.id, status: v.status, outcome: v.outcome, url: v.url, expected: o.expected ?? describeExpected(v.expected as Expectation), observed: o.observed ?? null, checkedAt: v.checkedAt, attempts: v.attempts, nextRetryAt: v.nextRetryAt, lastError: v.lastError, fetchStatus: v.fetchStatus };
      }),
      // Demonstration tasks never borrow the subscription's real measurements.
      impact: t.isFixture ? ({ state: "not_implemented" } as const) : buildImpact({ implementedAt: t.implementedAt, cycles, customerDomain, competitors }),
    })),
  };
}
