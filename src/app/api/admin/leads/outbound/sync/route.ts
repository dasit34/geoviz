import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getOutboundProvider } from "@/lib/outbound/registry";
import { normalizeOutreachStatus } from "@/lib/leads/normalizeOutreachStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROVIDER_NAME = "instantly";

/**
 * POST /api/admin/leads/outbound/sync — the documented polling
 * fallback (no live webhook receiver this phase — see
 * src/lib/outbound/providers/instantly.ts's doc comment for why).
 * `{ campaignId: string }`. Bounded to one campaign per call;
 * `fetchCampaignLeadStatuses()` itself caps total pages fetched.
 * Only updates LeadOutreach rows that already exist for this
 * provider+campaign — never creates a new one (a status sync should
 * never be how a lead first gets marked as sent).
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:outbound:sync",
    limit: 15,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { campaignId?: unknown } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const provider = getOutboundProvider(PROVIDER_NAME);
  if (!provider || !provider.enabled()) {
    return NextResponse.json(
      { error: provider ? "This outbound provider is not configured (missing API key)." : "Unknown outbound provider." },
      { status: 409 },
    );
  }

  const result = await provider.fetchCampaignLeadStatuses(campaignId);
  if (result.error && result.statuses.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const existingRows = await prisma.leadOutreach.findMany({
    where: { provider: PROVIDER_NAME, providerCampaignId: campaignId },
    select: { id: true, providerLeadId: true },
  });
  const rowByProviderLeadId = new Map(
    existingRows.filter((r) => r.providerLeadId).map((r) => [r.providerLeadId as string, r]),
  );

  let updated = 0;
  for (const statusRow of result.statuses) {
    const row = rowByProviderLeadId.get(statusRow.providerLeadId);
    if (!row) continue; // status sync never creates a new LeadOutreach row
    await prisma.leadOutreach.update({
      where: { id: row.id },
      data: {
        status: normalizeOutreachStatus(statusRow.rawStatus),
        lastSyncedAt: new Date(),
        lastProviderPayload: (statusRow.rawStatus ?? null) as Prisma.InputJsonValue,
      },
    });
    updated += 1;
  }

  console.log(
    `[admin-leads] outbound sync campaignId=${campaignId} fetched=${result.statuses.length} matched=${updated}${result.error ? ` partialError="${result.error}"` : ""}`,
  );

  return NextResponse.json({
    fetched: result.statuses.length,
    updated,
    providerError: result.error ?? null,
  });
}
