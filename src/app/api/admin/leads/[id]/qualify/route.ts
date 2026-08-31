import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { qualifyLead } from "@/lib/leads/qualifyLead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One HTML fetch + 4 parallel analyzers can take a few seconds on a
// slow target site — same budget class as the Free Check route.
export const maxDuration = 30;

/**
 * POST /api/admin/leads/[id]/qualify — run the free, deterministic
 * qualification pipeline for one lead. No external paid API involved
 * (see src/lib/leads/qualifyLead.ts) — the normal rate limit is
 * sufficient, no spend guardrail needed.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:qualify",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const result = await qualifyLead({
    website: lead.website,
    category: lead.category,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
  });

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      qualificationScore: result.score,
      qualificationReasons: result.reasons,
      status: result.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
      qualifiedAt: new Date(),
    },
  });

  console.log(
    `[admin-leads] qualified id=${lead.id} score=${result.score} qualified=${result.qualified}`,
  );

  return NextResponse.json({ lead: updated });
}
