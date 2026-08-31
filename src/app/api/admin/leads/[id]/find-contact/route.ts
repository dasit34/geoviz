import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { enrichOneLead } from "@/lib/leads/enrichLead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Outscraper's Emails & Contacts lookup can poll for up to ~20s inside
// enrichOneLead() — see src/lib/enrichment/providers/outscraper.ts.
export const maxDuration = 30;

/**
 * POST /api/admin/leads/[id]/find-contact — contact enrichment.
 * Gated to QUALIFIED/READY_FOR_CONTACT leads with a website/domain —
 * see src/lib/leads/enrichLead.ts for the full guard + backfill-only
 * write logic (shared with the bulk enrich-batch route).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:find-contact",
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await enrichOneLead(params.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ lead: result.lead });
}
