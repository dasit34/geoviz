import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import {
  normalizeAddressForDedup,
  normalizeBusinessNameForDedup,
  normalizeDomain,
  normalizeIndustry,
  normalizePhoneDigits,
} from "@/lib/leads/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/leads — manually add lead(s). Accepts either a
 * single lead object or `{ leads: [...] }` for a bulk add (mirrors
 * CalibrationDashboard's bulk-add pattern: per-row try/catch, batch
 * summary response). No external API calls — pure DB writes, so no
 * spend guardrail needed beyond the normal rate limit.
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:create",
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

  const inputRows: unknown[] = Array.isArray((body as { leads?: unknown })?.leads)
    ? (body as { leads: unknown[] }).leads
    : [body];

  const created: string[] = [];
  const skipped: { index: number; reason: string }[] = [];

  for (let i = 0; i < inputRows.length; i++) {
    const row = inputRows[i] as Record<string, unknown>;
    const businessName =
      typeof row.businessName === "string" ? row.businessName.trim() : "";
    if (!businessName) {
      skipped.push({ index: i, reason: "businessName is required" });
      continue;
    }

    const website = typeof row.website === "string" ? row.website.trim() : null;
    const categoryRaw = typeof row.category === "string" ? row.category : null;

    try {
      const lead = await prisma.lead.create({
        data: {
          businessName,
          businessNameNormalized:
            normalizeBusinessNameForDedup(businessName) ?? businessName.toLowerCase(),
          website: website || null,
          domain: normalizeDomain(website),
          phoneNormalized: normalizePhoneDigits(
            typeof row.phone === "string" ? row.phone : null,
          ),
          addressNormalized: normalizeAddressForDedup(
            typeof row.address === "string" ? row.address : null,
          ),
          category:
            categoryRaw && normalizeIndustry(categoryRaw).normalized !== "unknown"
              ? normalizeIndustry(categoryRaw).normalized
              : null,
          city: typeof row.city === "string" ? row.city : null,
          state: typeof row.state === "string" ? row.state : null,
          address: typeof row.address === "string" ? row.address : null,
          phone: typeof row.phone === "string" ? row.phone : null,
          source: "manual",
          notes: typeof row.notes === "string" ? row.notes : null,
          status: "NEW",
        },
      });
      created.push(lead.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ index: i, reason: message.slice(0, 200) });
    }
  }

  console.log(
    `[admin-leads] manual add created=${created.length} skipped=${skipped.length}`,
  );

  return NextResponse.json({ created: created.length, skipped, leadIds: created });
}
