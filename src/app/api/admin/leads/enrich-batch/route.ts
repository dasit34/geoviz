import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { enrichOneLead } from "@/lib/leads/enrichLead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each lead can poll Outscraper for up to ~20s — bounded batch size
// below keeps total worst-case well under typical function limits.
export const maxDuration = 120;

const MAX_BATCH = 25; // bounded — each lead does its own live provider lookup

/**
 * POST /api/admin/leads/enrich-batch — bulk contact enrichment for
 * selected leads. `{ ids: string[] }`. Mirrors qualify-batch/route.ts's
 * shape. Each id is enriched independently via the same
 * `enrichOneLead()` helper the single-lead route uses — same guards
 * (QUALIFIED/READY_FOR_CONTACT, must have website/domain, backfill-only
 * writes), so bulk enrichment can never spend provider credit on a
 * lead that wouldn't be enriched one at a time.
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:enrich-batch",
    limit: 10,
    windowMs: 60 * 60_000,
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

  const results: {
    id: string;
    ok: boolean;
    error?: string;
    contactEmail?: string | null;
    contactName?: string | null;
    contactTitle?: string | null;
    contactSource?: string | null;
  }[] = [];
  for (const id of ids) {
    const result = await enrichOneLead(id);
    results.push(
      result.ok
        ? {
            id,
            ok: true,
            contactEmail: result.lead.contactEmail,
            contactName: result.lead.contactName,
            contactTitle: result.lead.contactTitle,
            contactSource: result.lead.contactSource,
          }
        : { id, ok: false, error: result.error },
    );
  }

  console.log(
    `[admin-leads] enrich-batch processed=${results.length} ok=${results.filter((r) => r.ok).length}`,
  );

  return NextResponse.json({ results });
}
