import { NextResponse } from "next/server";

import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { normalizeIndustry } from "@/lib/intelligence/industry-taxonomy";
import {
  MARKET_STUDY_MAX_BATCH,
  MARKET_STUDY_RECENT_AUDIT_DAYS,
  MARKET_STUDY_SESSION_PREFIX,
} from "@/lib/market-studies/constants";
import { classifyLeadForAudit } from "@/lib/market-studies/eligibility";
import {
  createMarketStudyAudits,
  type LeadDecision,
} from "@/lib/market-studies/createStudyAudits";
import { estimateBatchCost } from "@/lib/market-studies/costEstimate";
import {
  countEntryStatuses,
  scoreStats,
} from "@/lib/market-studies/studyView";
import type { EligibilityContext } from "@/lib/market-studies/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LEAD_SELECT = {
  id: true,
  businessName: true,
  website: true,
  domain: true,
  status: true,
  category: true,
} as const;

/**
 * GET /api/admin/market-studies — list every study with rollup counts
 * + score stats. Also the poll source for the list page.
 */
export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:market-studies:list",
    limit: 300,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studies = await prisma.marketStudy.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      entries: {
        select: {
          skipReason: true,
          auditOrder: {
            select: {
              reportStatus: true,
              intelligence: { select: { overallScore: true } },
            },
          },
        },
      },
    },
  });

  const rows = studies.map((s) => {
    const counts = countEntryStatuses(s.entries);
    const stats = scoreStats(s.entries);
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      city: s.city,
      state: s.state,
      status: s.status,
      createdAt: s.createdAt,
      counts,
      scoreStats: stats,
    };
  });

  return NextResponse.json({ studies: rows });
}

type PostBody = {
  studyId?: unknown;
  name?: unknown;
  category?: unknown;
  city?: unknown;
  state?: unknown;
  leadIds?: unknown;
  confirm?: unknown;
};

/**
 * POST /api/admin/market-studies
 *
 * `{ leadIds, studyId?, name?, category?, city?, state?, confirm? }`
 *
 *   confirm falsy → DRY RUN. Resolves + classifies the leads, returns
 *   eligible/skipped + an estimated audit count and cost. NO writes.
 *
 *   confirm true  → creates the study (or loads `studyId`), then queues
 *   one audit per eligible lead via the existing worker pipeline.
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:market-studies:create",
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds)
    ? Array.from(
        new Set(
          body.leadIds.filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          ),
        ),
      )
    : [];
  if (leadIds.length === 0) {
    return NextResponse.json(
      { error: "leadIds is required" },
      { status: 400 },
    );
  }
  if (leadIds.length > MARKET_STUDY_MAX_BATCH) {
    return NextResponse.json(
      {
        error: `Too many leads — max ${MARKET_STUDY_MAX_BATCH} per run. Select fewer, or run again into the same study.`,
      },
      { status: 400 },
    );
  }

  const studyId = typeof body.studyId === "string" ? body.studyId : null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const confirm = body.confirm === true;
  const category =
    typeof body.category === "string" && body.category.trim()
      ? normalizeIndustry(body.category).normalized
      : null;
  const city =
    typeof body.city === "string" && body.city.trim()
      ? body.city.trim()
      : null;
  const state =
    typeof body.state === "string" && body.state.trim()
      ? body.state.trim()
      : null;

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: LEAD_SELECT,
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));

  // ── Eligibility context ──
  const since = new Date(
    Date.now() - MARKET_STUDY_RECENT_AUDIT_DAYS * 24 * 60 * 60 * 1000,
  );
  const [studyEntries, recentEntries] = await Promise.all([
    studyId
      ? prisma.marketStudyEntry.findMany({
          where: { studyId },
          select: { leadId: true },
        })
      : Promise.resolve([] as { leadId: string | null }[]),
    prisma.marketStudyEntry.findMany({
      where: {
        leadId: { in: leadIds },
        createdAt: { gte: since },
        auditOrder: {
          stripeSessionId: { startsWith: MARKET_STUDY_SESSION_PREFIX },
          reportStatus: { in: ["queued", "running", "generated"] },
        },
      },
      select: { leadId: true },
    }),
  ]);

  const ctx: EligibilityContext = {
    seenDomains: new Set<string>(),
    studyLeadIds: new Set(
      studyEntries
        .map((e) => e.leadId)
        .filter((x): x is string => Boolean(x)),
    ),
    recentlyAuditedLeadIds: new Set(
      recentEntries
        .map((e) => e.leadId)
        .filter((x): x is string => Boolean(x)),
    ),
  };

  // ── Classify each selected lead (original order) ──
  const decisions: LeadDecision[] = [];
  for (const id of leadIds) {
    const lead = leadById.get(id);
    if (!lead) {
      decisions.push({
        lead: {
          id,
          businessName: "(unknown lead)",
          website: null,
          domain: null,
          status: "",
          category: null,
        },
        result: { eligible: false, skipReason: "Lead not found" },
      });
      continue;
    }
    const result = classifyLeadForAudit(
      {
        id: lead.id,
        businessName: lead.businessName,
        website: lead.website,
        domain: lead.domain,
        status: lead.status,
      },
      ctx,
    );
    if (result.eligible) ctx.seenDomains.add(result.normalizedDomain);
    decisions.push({
      lead: { ...lead, category: lead.category },
      result,
    });
  }

  const eligible = decisions
    .filter((d) => d.result.eligible)
    .map((d) => ({
      leadId: d.lead.id,
      businessName: d.lead.businessName,
      website: d.lead.website,
    }));
  const skipped = decisions
    .filter((d) => !d.result.eligible)
    .map((d) => ({
      leadId: d.lead.id,
      businessName: d.lead.businessName,
      reason: d.result.eligible ? "" : d.result.skipReason,
    }));

  // ── DRY RUN ──
  if (!confirm) {
    return NextResponse.json({
      dryRun: true,
      eligible,
      skipped,
      eligibleCount: eligible.length,
      skippedCount: skipped.length,
      maxBatch: MARKET_STUDY_MAX_BATCH,
      estimatedCost: await estimateBatchCost(eligible.length),
    });
  }

  // ── CONFIRMED — write ──
  let study: { id: string; name: string };
  if (studyId) {
    const existing = await prisma.marketStudy.findUnique({
      where: { id: studyId },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Study not found" }, { status: 404 });
    }
    study = existing;
  } else {
    if (!name) {
      return NextResponse.json(
        { error: "name is required to create a new study" },
        { status: 400 },
      );
    }
    study = await prisma.marketStudy.create({
      data: { name, category, city, state },
      select: { id: true, name: true },
    });
  }

  const result = await createMarketStudyAudits({
    prisma,
    studyId: study.id,
    decisions,
  });

  console.log(
    `[market-study] batch complete studyId=${study.id} submitted=${leadIds.length} queued=${result.created.length} skipped=${result.skipped.length}`,
  );

  return NextResponse.json({
    studyId: study.id,
    studyName: study.name,
    created: result.created,
    skipped: result.skipped,
    queuedCount: result.created.length,
    skippedCount: result.skipped.length,
  });
}
