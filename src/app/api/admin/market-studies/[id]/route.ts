import { NextResponse } from "next/server";

import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { deriveEntryStatus } from "@/lib/market-studies/entryStatus";
import {
  countEntryStatuses,
  scoreStats,
  toAggregateRows,
  type StudyEntryRow,
} from "@/lib/market-studies/studyView";
import { computeStudyAggregate } from "@/lib/market-studies/aggregates";
import { buildCaseStudySummary } from "@/lib/market-studies/caseStudySummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/market-studies/[id] — full study detail. Also the
 * poll endpoint for the detail page (called every ~5s while any entry
 * is non-terminal). Everything is recomputed live — no stored rollups.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:market-studies:detail",
    limit: 300,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const study = await prisma.marketStudy.findUnique({
    where: { id: params.id },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          leadId: true,
          auditOrderId: true,
          businessName: true,
          websiteUrl: true,
          skipReason: true,
          createdAt: true,
          auditOrder: {
            select: {
              reportStatus: true,
              reportGeneratedAt: true,
              intelligence: {
                select: {
                  overallScore: true,
                  deterministicScore: true,
                  industryCategoryNormalized: true,
                },
              },
            },
          },
          lead: {
            select: {
              id: true,
              status: true,
              outreach: { select: { status: true } },
            },
          },
        },
      },
    },
  });

  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  const entries = study.entries as unknown as StudyEntryRow[];
  const counts = countEntryStatuses(entries);
  const stats = scoreStats(entries);
  const aggregate = computeStudyAggregate(toAggregateRows(entries));
  const caseStudySummary = buildCaseStudySummary(
    { category: study.category, city: study.city, state: study.state },
    aggregate,
  );

  return NextResponse.json({
    study: {
      id: study.id,
      name: study.name,
      category: study.category,
      city: study.city,
      state: study.state,
      status: study.status,
      notes: study.notes,
      createdAt: study.createdAt,
    },
    counts,
    scoreStats: stats,
    aggregate,
    caseStudySummary,
    entries: entries.map((e) => ({
      id: e.id,
      leadId: e.leadId,
      businessName: e.businessName,
      websiteUrl: e.websiteUrl,
      status: deriveEntryStatus(e),
      skipReason: e.skipReason,
      auditOrderId: e.auditOrderId,
      overallScore: e.auditOrder?.intelligence?.overallScore ?? null,
      reportGeneratedAt: e.auditOrder?.reportGeneratedAt ?? null,
      leadStatus: e.lead?.status ?? null,
      outreachStatus:
        e.lead?.outreach.find((o) =>
          ["SENT_TO_INSTANTLY", "ACTIVE", "REPLIED", "INTERESTED"].includes(
            o.status,
          ),
        )?.status ??
        e.lead?.outreach[0]?.status ??
        null,
    })),
  });
}

type PatchBody = {
  name?: unknown;
  status?: unknown;
  notes?: unknown;
};

/** PATCH /api/admin/market-studies/[id] — rename / archive / notes. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:market-studies:patch",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: { name?: string; status?: string; notes?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (body.status === "active" || body.status === "archived") {
    data.status = body.status;
  }
  if (typeof body.notes === "string") {
    data.notes = body.notes.trim() || null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.marketStudy.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, status: true, notes: true },
    });
    return NextResponse.json({ study: updated });
  } catch {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
}
