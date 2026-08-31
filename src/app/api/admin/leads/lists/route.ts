import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/leads/lists — every LeadList with a member count. */
export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:lists:list",
    limit: 120,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lists = await prisma.leadList.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { memberships: true } } },
  });

  return NextResponse.json({
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      createdAt: l.createdAt,
      memberCount: l._count.memberships,
    })),
  });
}

/** POST /api/admin/leads/lists — create a new list. `{ name, description? }` */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:lists:create",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; description?: unknown } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const list = await prisma.leadList.create({
    data: {
      name,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
    },
  });

  console.log(`[admin-leads] list created id=${list.id} name="${list.name}"`);

  return NextResponse.json({ list });
}
