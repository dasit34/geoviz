import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { qualifyLead } from "@/lib/leads/qualifyLead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BATCH = 25; // bounded — each lead does its own live HTML fetch

/**
 * POST /api/admin/leads/qualify-batch — bulk-qualify selected leads.
 * `{ ids: string[] }`. Still free (no external paid API), but bounded
 * per request since each lead does its own live outbound fetch —
 * large batches should be run as multiple requests, not one giant one.
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:qualify-batch",
    limit: 20,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids[] is required" }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `ids[] exceeds max batch size of ${MAX_BATCH}` },
      { status: 400 },
    );
  }

  const leads = await prisma.lead.findMany({ where: { id: { in: ids } } });

  const results: { id: string; score: number; qualified: boolean }[] = [];
  for (const lead of leads) {
    const result = await qualifyLead({
      website: lead.website,
      category: lead.category,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        qualificationScore: result.score,
        qualificationReasons: result.reasons,
        status: result.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
        qualifiedAt: new Date(),
      },
    });
    results.push({ id: lead.id, score: result.score, qualified: result.qualified });
  }

  console.log(`[admin-leads] qualify-batch processed=${results.length}`);

  return NextResponse.json({ results });
}
