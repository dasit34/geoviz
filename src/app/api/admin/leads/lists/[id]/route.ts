import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/leads/lists/[id] — the list plus its member leads. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:lists:get",
    limit: 120,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const list = await prisma.leadList.findUnique({
    where: { id: params.id },
    include: {
      memberships: {
        orderBy: { addedAt: "desc" },
        include: { lead: true },
      },
    },
  });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json({
    list: {
      id: list.id,
      name: list.name,
      description: list.description,
      createdAt: list.createdAt,
    },
    leads: list.memberships.map((m) => m.lead),
  });
}

/** PATCH /api/admin/leads/lists/[id] — rename / edit description. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:lists:update",
    limit: 60,
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

  const existing = await prisma.leadList.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "name cannot be blank" }, { status: 400 });
  }

  const list = await prisma.leadList.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(typeof body.description === "string"
        ? { description: body.description.trim() || null }
        : {}),
    },
  });

  return NextResponse.json({ list });
}

/** DELETE /api/admin/leads/lists/[id] — deletes the list (memberships cascade, leads survive). */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:lists:delete",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.leadList.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  await prisma.leadList.delete({ where: { id: params.id } });
  console.log(`[admin-leads] list deleted id=${params.id}`);

  return NextResponse.json({ status: "deleted" });
}
