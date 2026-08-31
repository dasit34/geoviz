import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BULK_IDS = 500;

function parseLeadIds(body: unknown): string[] | null {
  const ids = (body as { leadIds?: unknown })?.leadIds;
  if (!Array.isArray(ids)) return null;
  const filtered = ids.filter((id): id is string => typeof id === "string");
  return filtered.length > 0 ? filtered : null;
}

/**
 * POST /api/admin/leads/lists/[id]/members — add lead(s) to a list.
 * `{ leadIds: string[] }`. Idempotent — re-adding an existing member is
 * a no-op via `@@unique([leadId, leadListId])`.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:lists:members:add",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const leadIds = parseLeadIds(body);
  if (!leadIds) {
    return NextResponse.json({ error: "leadIds[] is required" }, { status: 400 });
  }
  if (leadIds.length > MAX_BULK_IDS) {
    return NextResponse.json(
      { error: `leadIds[] exceeds max of ${MAX_BULK_IDS}` },
      { status: 400 },
    );
  }

  const list = await prisma.leadList.findUnique({ where: { id: params.id } });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  let added = 0;
  for (const leadId of leadIds) {
    try {
      await prisma.leadListMembership.upsert({
        where: { leadId_leadListId: { leadId, leadListId: params.id } },
        create: { leadId, leadListId: params.id },
        update: {},
      });
      added += 1;
    } catch (err) {
      // Most likely an invalid leadId (FK violation) — skip, don't abort the batch.
      console.error(
        `[admin-leads] list-member add failed listId=${params.id} leadId=${leadId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`[admin-leads] list-members added listId=${params.id} count=${added}`);

  return NextResponse.json({ status: "saved", added });
}

/**
 * DELETE /api/admin/leads/lists/[id]/members — remove lead(s) from a list.
 * `{ leadIds: string[] }`.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:lists:members:remove",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const leadIds = parseLeadIds(body);
  if (!leadIds) {
    return NextResponse.json({ error: "leadIds[] is required" }, { status: 400 });
  }

  const result = await prisma.leadListMembership.deleteMany({
    where: { leadListId: params.id, leadId: { in: leadIds } },
  });

  console.log(`[admin-leads] list-members removed listId=${params.id} count=${result.count}`);

  return NextResponse.json({ status: "removed", count: result.count });
}
