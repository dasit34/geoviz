/* eslint-disable no-console */
/**
 * Daily Market Study automation — the one idempotent "decide and act"
 * entry point. Called on every cron tick (every ~15 min, see
 * `scripts/daily-market-study-automation.ts`) and, for a small
 * on-demand batch, from the admin test-run route.
 *
 * Composes existing, UNMODIFIED functions:
 *   - discovery:  `getDiscoveryProvider()` + `importDiscoveredBusiness()`
 *                 (same primitives `/api/admin/leads/discover` uses)
 *   - qualify:    `qualifyLead()` (same as the manual qualify routes)
 *   - eligibility:`classifyLeadForAudit()` (unchanged — the manual
 *                 admin flow is unaffected)
 *   - enqueue:    `createMarketStudyAudits()` (unchanged)
 *   - reporting:  `countEntryStatuses()` (unchanged)
 *
 * The only genuinely new logic is: the `MarketStudyAutomationRun`
 * claim (idempotency/overlap guard), the existing-customer exclusion
 * (`excludeExistingCustomers.ts`), and the finalize→email step.
 *
 * Never touches `scripts/geo-worker.ts` — audits still drain through
 * the existing, frozen worker loop exactly like any other Market
 * Study batch.
 */

import type { PrismaClient, MarketStudyAutomationRun } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";
import { getDiscoveryProvider } from "@/lib/discovery/registry";
import { importDiscoveredBusiness } from "@/lib/leads/dedupe";
import { filterDiscoveryRecords } from "@/lib/leads/discoveryFilters";
import { normalizeIndustry } from "@/lib/intelligence/industry-taxonomy";
import { qualifyLead } from "@/lib/leads/qualifyLead";
import { classifyLeadForAudit } from "@/lib/market-studies/eligibility";
import {
  createMarketStudyAudits,
  type LeadDecision,
} from "@/lib/market-studies/createStudyAudits";
import { estimateBatchCost } from "@/lib/market-studies/costEstimate";
import { countEntryStatuses } from "@/lib/market-studies/studyView";
import {
  MARKET_STUDY_RECENT_AUDIT_DAYS,
  MARKET_STUDY_SESSION_PREFIX,
} from "@/lib/market-studies/constants";
import type { EligibilityContext } from "@/lib/market-studies/types";

import {
  loadDailyAutomationConfig,
  pickTodaysIndustryLocation,
  utcMidnight,
  type DailyAutomationConfig,
} from "./config";
import { findExistingCustomerLeadIds } from "./excludeExistingCustomers";
import { sendDailyAutomationSummaryEmail } from "./summaryEmail";

export type TickResult =
  | { action: "finalized"; runId: string }
  | { action: "kicked-off"; runId: string; collected: number; qualified: number; queued: number; skipped: number }
  | { action: "skipped"; reason: string };

function isP2002(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002",
  );
}

async function markFailed(prisma: PrismaClient, runId: string, reason: string): Promise<void> {
  console.error(`[market-study-daily] run failed runId=${runId}: ${reason}`);
  await prisma.marketStudyAutomationRun.update({
    where: { id: runId },
    data: { status: "failed", lastError: reason.slice(0, 500), completedAt: new Date() },
  });
}

/** Small hand-rolled concurrency pool — no new dependency for this. */
async function qualifyLeadsWithConcurrency(
  prisma: PrismaClient,
  leadIds: string[],
  concurrency: number,
): Promise<number> {
  let qualifiedCount = 0;
  let index = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = index++;
      if (i >= leadIds.length) return;
      const id = leadIds[i];
      try {
        const lead = await prisma.lead.findUnique({ where: { id } });
        if (!lead) continue;
        const result = await qualifyLead({
          website: lead.website,
          category: lead.category,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
        });
        await prisma.lead.update({
          where: { id },
          data: {
            qualificationScore: result.score,
            qualificationReasons: result.reasons,
            status: result.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
            qualifiedAt: new Date(),
          },
        });
        if (result.qualified) qualifiedCount += 1;
      } catch (err) {
        console.error(
          `[market-study-daily] qualify failed leadId=${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, leadIds.length)) }, () => worker());
  await Promise.all(workers);
  return qualifiedCount;
}

/**
 * The actual discover → qualify → exclude → enqueue body. Assumes the
 * `MarketStudyAutomationRun` row is already claimed (status
 * "running") — this only executes and updates it. Any error anywhere
 * in here is caught and turned into `status: "failed"` +
 * `lastError`; it never throws back to the caller (a tick or a test
 * request must never crash on a bad discovery response).
 */
async function executeKickoff(
  prisma: PrismaClient,
  config: DailyAutomationConfig,
  run: MarketStudyAutomationRun,
): Promise<{ collected: number; qualified: number; queued: number; skipped: number } | null> {
  try {
    const provider = getDiscoveryProvider(config.discoveryProvider);
    if (!provider || !provider.enabled()) {
      await markFailed(prisma, run.id, `Discovery provider "${config.discoveryProvider}" is not configured (missing API key).`);
      return null;
    }

    const category = normalizeIndustry(run.industry).normalized;
    const discoveryRun = await prisma.leadDiscoveryRun.create({
      data: {
        provider: provider.name,
        industry: category,
        city: run.city,
        state: run.state,
        requestedCount: run.targetCount,
        providerRequestCount: 0,
      },
    });

    let result;
    try {
      result = await provider.discoverBusinesses(
        { category, city: run.city, state: run.state ?? undefined, limit: run.targetCount },
        {
          onJobAccepted: async (jobId) => {
            await prisma.leadDiscoveryRun.update({
              where: { id: discoveryRun.id },
              data: { providerJobId: jobId, providerJobStatus: "PENDING" },
            });
          },
        },
      );
    } catch (err) {
      await markFailed(
        prisma,
        run.id,
        `Discovery call threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    const { passed } = filterDiscoveryRecords(result.records.slice(0, run.targetCount), {});
    let imported = 0;
    let matched = 0;
    const touchedLeadIds: string[] = [];
    for (const record of passed) {
      try {
        const outcome = await importDiscoveredBusiness(record);
        if (outcome.matched) matched += 1;
        else imported += 1;
        touchedLeadIds.push(outcome.lead.id);
      } catch (err) {
        console.error(
          `[market-study-daily] import failed provider=${provider.name} providerId=${record.providerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await prisma.leadDiscoveryRun.update({
      where: { id: discoveryRun.id },
      data: {
        providerRequestCount: result.providerRequestCount,
        resultCount: result.records.length,
        newLeadsCreated: imported,
        matchedExistingCount: matched,
        providerJobId: result.providerJobId ?? undefined,
        providerJobStatus: result.providerJobStatus ?? undefined,
      },
    });

    const uniqueLeadIds = Array.from(new Set(touchedLeadIds));
    const qualifiedCount = await qualifyLeadsWithConcurrency(prisma, uniqueLeadIds, config.qualifyConcurrency);

    const existingCustomerIds = await findExistingCustomerLeadIds(uniqueLeadIds, prisma);
    const candidateIds = uniqueLeadIds.filter((id) => !existingCustomerIds.has(id));

    const leads = await prisma.lead.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, businessName: true, website: true, domain: true, status: true, category: true },
    });
    const leadById = new Map(leads.map((l) => [l.id, l]));

    const since = new Date(Date.now() - MARKET_STUDY_RECENT_AUDIT_DAYS * 24 * 60 * 60 * 1000);
    const recentEntries = await prisma.marketStudyEntry.findMany({
      where: {
        leadId: { in: candidateIds },
        createdAt: { gte: since },
        auditOrder: {
          stripeSessionId: { startsWith: MARKET_STUDY_SESSION_PREFIX },
          reportStatus: { in: ["queued", "running", "generated"] },
        },
      },
      select: { leadId: true },
    });

    const ctx: EligibilityContext = {
      seenDomains: new Set(),
      studyLeadIds: new Set(),
      recentlyAuditedLeadIds: new Set(
        recentEntries.map((e) => e.leadId).filter((x): x is string => Boolean(x)),
      ),
    };

    const decisions: LeadDecision[] = [];
    for (const id of candidateIds) {
      const lead = leadById.get(id);
      if (!lead) continue;
      const classified = classifyLeadForAudit(lead, ctx);
      if (classified.eligible) ctx.seenDomains.add(classified.normalizedDomain);
      decisions.push({ lead: { ...lead, category: lead.category }, result: classified });
    }

    let blockedExcluded = 0;
    let duplicatesExcluded = 0;
    for (const d of decisions) {
      if (!d.result.eligible) {
        if (d.result.skipReason.startsWith("Lead status is")) blockedExcluded += 1;
        else duplicatesExcluded += 1;
      }
    }

    let eligibleDecisions = decisions.filter((d) => d.result.eligible);
    const ineligibleDecisions = decisions.filter((d) => !d.result.eligible);

    if (config.costCeilingUsd !== null && eligibleDecisions.length > 0) {
      const estimate = await estimateBatchCost(eligibleDecisions.length, prisma);
      if (estimate.perAuditUsd > 0 && estimate.totalUsd > config.costCeilingUsd) {
        const maxAffordable = Math.max(0, Math.floor(config.costCeilingUsd / estimate.perAuditUsd));
        const trimmed = eligibleDecisions.slice(maxAffordable);
        eligibleDecisions = eligibleDecisions.slice(0, maxAffordable);
        duplicatesExcluded += trimmed.length;
        console.log(
          `[market-study-daily] cost ceiling trimmed runId=${run.id} kept=${eligibleDecisions.length} trimmed=${trimmed.length}`,
        );
      }
    }

    const study = await prisma.marketStudy.create({
      data: {
        name: `Daily Automation — ${run.industry} — ${run.city}${run.state ? `, ${run.state}` : ""} — ${run.runDate.toISOString().slice(0, 10)}`,
        category,
        city: run.city,
        state: run.state,
      },
      select: { id: true },
    });

    const createResult = await createMarketStudyAudits({
      prisma,
      studyId: study.id,
      decisions: [...eligibleDecisions, ...ineligibleDecisions],
    });

    await prisma.marketStudyAutomationRun.update({
      where: { id: run.id },
      data: {
        leadDiscoveryRunId: discoveryRun.id,
        marketStudyId: study.id,
        businessesCollected: uniqueLeadIds.length,
        businessesQualified: qualifiedCount,
        duplicatesExcluded,
        existingCustomersExcluded: existingCustomerIds.size,
        blockedExcluded,
      },
    });

    console.log(
      `[market-study-daily] kickoff done runId=${run.id} studyId=${study.id} collected=${uniqueLeadIds.length} qualified=${qualifiedCount} queued=${createResult.created.length} skipped=${createResult.skipped.length}`,
    );

    return {
      collected: uniqueLeadIds.length,
      qualified: qualifiedCount,
      queued: createResult.created.length,
      skipped: createResult.skipped.length,
    };
  } catch (err) {
    await markFailed(prisma, run.id, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Claims today's slot — the entire overlap/duplicate-run guard. A
 * P2002 on `runDate` means today's row already exists; if it's
 * `"failed"` and under the retry budget, reuse it (retry); otherwise
 * this is a genuine no-op ("already running or already ran today").
 */
export async function claimDailyRun(
  prisma: PrismaClient,
  config: DailyAutomationConfig,
  runDate: Date,
  selection: { industry: string; city: string; state: string | null },
): Promise<MarketStudyAutomationRun | null> {
  try {
    return await prisma.marketStudyAutomationRun.create({
      data: {
        runDate,
        industry: selection.industry,
        city: selection.city,
        state: selection.state,
        targetCount: config.batchSize,
        status: "running",
      },
    });
  } catch (err) {
    if (!isP2002(err)) throw err;
    const existing = await prisma.marketStudyAutomationRun.findUnique({ where: { runDate } });
    if (existing && existing.status === "failed" && existing.retryCount < config.maxRetries) {
      return prisma.marketStudyAutomationRun.update({
        where: { id: existing.id },
        data: { status: "running", retryCount: { increment: 1 }, lastError: null },
      });
    }
    return null;
  }
}

async function tryFinalize(prisma: PrismaClient, config: DailyAutomationConfig): Promise<TickResult | null> {
  const runningRun = await prisma.marketStudyAutomationRun.findFirst({
    where: { status: "running", marketStudyId: { not: null } },
    orderBy: { startedAt: "asc" },
  });
  if (!runningRun || !runningRun.marketStudyId) return null;

  const study = await prisma.marketStudy.findUnique({
    where: { id: runningRun.marketStudyId },
    include: {
      entries: {
        select: {
          skipReason: true,
          auditOrder: {
            select: { reportStatus: true, intelligence: { select: { overallScore: true } } },
          },
        },
      },
    },
  });
  if (!study) return null;

  const counts = countEntryStatuses(study.entries);
  if (counts.queued + counts.running > 0) return null; // still draining

  const sent = await sendDailyAutomationSummaryEmail(runningRun.id, config.recipientEmail, prisma);
  await prisma.marketStudyAutomationRun.update({
    where: { id: runningRun.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      summaryEmailSentAt: sent ? new Date() : null,
    },
  });
  return { action: "finalized", runId: runningRun.id };
}

async function tryKickoff(prisma: PrismaClient, config: DailyAutomationConfig): Promise<TickResult> {
  if (!config.enabled) return { action: "skipped", reason: "disabled" };

  const now = new Date();
  if (now.getUTCHours() < config.runHourUtc) return { action: "skipped", reason: "not-yet-run-hour" };

  const selection = pickTodaysIndustryLocation(config);
  if (!selection) return { action: "skipped", reason: "no-industries-or-locations-configured" };

  const today = utcMidnight(now);
  const run = await claimDailyRun(prisma, config, today, selection);
  if (!run) return { action: "skipped", reason: "already-ran-or-running-today" };

  const outcome = await executeKickoff(prisma, config, run);
  if (!outcome) return { action: "skipped", reason: "kickoff-failed" };

  return { action: "kicked-off", runId: run.id, ...outcome };
}

/** The one entry point the cron script calls on every tick. */
export async function runTick(prisma: PrismaClient = defaultPrisma): Promise<TickResult> {
  const config = loadDailyAutomationConfig();

  const finalized = await tryFinalize(prisma, config);
  if (finalized) return finalized;

  return tryKickoff(prisma, config);
}

/**
 * Manual small-batch test — used only by the admin test-run route.
 * Always `isManualTest: true`, `runDate` is a full-precision
 * timestamp (never collides with the daily `runDate` uniqueness
 * guard), and `businessCount` is clamped by the caller (2–5).
 */
export async function runManualTestKickoff(
  params: { businessCount: number; industry?: string; city?: string; state?: string | null },
  prisma: PrismaClient = defaultPrisma,
): Promise<{ runId: string; studyId: string | null } | { error: string }> {
  const config = loadDailyAutomationConfig();
  const selection =
    params.industry && params.city
      ? { industry: params.industry, city: params.city, state: params.state ?? null }
      : pickTodaysIndustryLocation(config);
  if (!selection) {
    return {
      error:
        "No industry/city provided, and MARKET_STUDY_DAILY_INDUSTRIES/MARKET_STUDY_DAILY_LOCATIONS are not configured.",
    };
  }

  const run = await prisma.marketStudyAutomationRun.create({
    data: {
      runDate: new Date(),
      isManualTest: true,
      status: "running",
      industry: selection.industry,
      city: selection.city,
      state: selection.state,
      targetCount: params.businessCount,
    },
  });

  await executeKickoff(prisma, config, run);
  const refreshed = await prisma.marketStudyAutomationRun.findUnique({ where: { id: run.id } });
  if (refreshed?.status === "failed") {
    return { error: refreshed.lastError ?? "Kickoff failed for an unknown reason." };
  }
  return { runId: run.id, studyId: refreshed?.marketStudyId ?? null };
}
