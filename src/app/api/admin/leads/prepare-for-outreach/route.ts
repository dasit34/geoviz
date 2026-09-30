import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { prepareLeadsForOutreach } from "@/lib/leads/prepareForOutreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Chains a qualify (live HTML fetch) AND an enrich (up to a ~20s
// provider poll) per lead — up to 2x either individual batch action's
// worst case. Set to the platform max; MAX_BATCH below is the real
// safety valve (matches qualify-batch/enrich-batch's own cap).
export const maxDuration = 300;

const MAX_BATCH = 25; // bounded — mirrors qualify-batch/enrich-batch

/**
 * POST /api/admin/leads/prepare-for-outreach — orchestrates the
 * EXISTING qualify-batch and enrich-batch logic in sequence for a
 * mixed selection of leads. `{ ids: string[] }`.
 *
 * Does not duplicate qualification or enrichment logic — see
 * `src/lib/leads/prepareForOutreach.ts` for the per-lead decision
 * tree. Safe to call repeatedly on the same ids (already-qualified
 * and already-enriched leads are skipped, not reprocessed).
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:prepare-for-outreach",
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

  const result = await prepareLeadsForOutreach(ids);

  console.log(
    `[admin-leads] prepare-for-outreach processed=${ids.length} summary=${JSON.stringify(result.summary)}`,
  );

  return NextResponse.json(result);
}
