import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getOutboundProvider } from "@/lib/outbound/registry";
import { filterSendEligibleLeads } from "@/lib/leads/outboundEligibility";
import { toOutboundLeadInput } from "@/lib/leads/toOutboundLeadInput";
import type { OutboundLeadInput } from "@/lib/outbound/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 25; // conservative first-version cap per explicit instruction
const PROVIDER_NAME = "instantly";

/**
 * POST /api/admin/leads/outbound/send — the single endpoint for both
 * the preview (dry-run) and the confirmed send, distinguished by
 * `confirm`. Eligibility is re-computed server-side on EVERY call,
 * including a confirmed send — the client's dry-run result is never
 * trusted as authorization to send.
 *
 * `{ leadIds: string[], campaignId?: string, campaignName?: string, confirm?: boolean }`
 *   confirm falsy/absent → dry-run: returns eligible/skipped breakdown
 *     PLUS `payloadPreview` (the exact non-secret data that would be
 *     sent). Sends nothing, writes nothing, and — deliberately —
 *     requires neither a configured provider nor a campaignId, so this
 *     is a genuine local/mock mode usable before INSTANTLY_API_KEY
 *     even exists. `campaignId` is optional here; when omitted, the
 *     "already sent to this campaign" check is skipped (there's no
 *     campaign to check against) but every other eligibility rule
 *     still runs.
 *   confirm: true → REQUIRES both `campaignId` and a configured,
 *     enabled provider (this is the only path that makes a real
 *     Instantly API call). Sends only the eligible subset, writes one
 *     LeadOutreach row per lead (SENT_TO_INSTANTLY or FAILED).
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:outbound:send",
    limit: 20,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { leadIds?: unknown; campaignId?: unknown; campaignName?: unknown; confirm?: unknown } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.filter((id): id is string => typeof id === "string")
    : [];
  const campaignId = typeof body.campaignId === "string" && body.campaignId ? body.campaignId : null;
  const campaignName = typeof body.campaignName === "string" ? body.campaignName : null;
  const confirm = body.confirm === true;

  if (leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds[] is required" }, { status: 400 });
  }
  if (leadIds.length > MAX_BATCH) {
    return NextResponse.json({ error: `leadIds[] exceeds max batch size of ${MAX_BATCH}` }, { status: 400 });
  }

  // A real send needs a real campaign + a working provider connection.
  // A dry-run/preview needs neither — see doc comment above.
  let provider = null as ReturnType<typeof getOutboundProvider>;
  if (confirm) {
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required to send" }, { status: 400 });
    }
    provider = getOutboundProvider(PROVIDER_NAME);
    if (!provider || !provider.enabled()) {
      return NextResponse.json(
        { error: provider ? "This outbound provider is not configured (missing API key)." : "Unknown outbound provider." },
        { status: 409 },
      );
    }
  }

  const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } } });
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const existingOutreach = await prisma.leadOutreach.findMany({
    where: { leadId: { in: leadIds }, provider: PROVIDER_NAME },
    select: { leadId: true, providerCampaignId: true, status: true },
  });
  const outreachByLeadId = new Map<string, { providerCampaignId: string; status: string }[]>();
  for (const row of existingOutreach) {
    const list = outreachByLeadId.get(row.leadId) ?? [];
    list.push({ providerCampaignId: row.providerCampaignId, status: row.status });
    outreachByLeadId.set(row.leadId, list);
  }

  const { eligible, skipped } = filterSendEligibleLeads(
    leads.map((l) => ({ leadId: l.id, email: l.contactEmail, status: l.status })),
    { campaignId, outreachByLeadId },
  );
  // Leads whose ids weren't found in the DB at all (shouldn't happen from the UI, but defensive).
  for (const id of leadIds) {
    if (!leadById.has(id)) skipped.push({ leadId: id, reason: "Lead not found." });
  }

  const eligibleDetails = eligible.map((e) => {
    const lead = leadById.get(e.leadId)!;
    return { leadId: lead.id, businessName: lead.businessName, email: lead.contactEmail };
  });
  const skippedDetails = skipped.map((s) => ({
    leadId: s.leadId,
    businessName: leadById.get(s.leadId)?.businessName ?? null,
    reason: s.reason,
  }));

  if (!confirm) {
    // payloadPreview — the exact, non-secret data GeoViz would send for
    // each eligible lead, computed purely locally via the same mapping
    // sendLeads() itself uses. Never calls the provider — safe to
    // inspect with no INSTANTLY_API_KEY configured at all.
    const payloadPreview: OutboundLeadInput[] = eligible.map((e) => toOutboundLeadInput(leadById.get(e.leadId)!));
    return NextResponse.json({
      dryRun: true,
      eligibleCount: eligible.length,
      skippedCount: skipped.length,
      eligible: eligibleDetails,
      skipped: skippedDetails,
      payloadPreview,
    });
  }

  // Reaching here means confirm === true, which already guaranteed
  // campaignId + provider are set above — these guards are for
  // TypeScript's benefit (and a defensive runtime backstop).
  if (!campaignId || !provider) {
    return NextResponse.json({ error: "campaignId and a configured provider are required to send" }, { status: 400 });
  }

  if (eligible.length === 0) {
    return NextResponse.json({
      dryRun: false,
      sentCount: 0,
      failedCount: 0,
      eligibleCount: 0,
      skippedCount: skipped.length,
      skipped: skippedDetails,
    });
  }

  const inputs: OutboundLeadInput[] = eligible.map((e) => toOutboundLeadInput(leadById.get(e.leadId)!));

  const result = await provider.sendLeads(campaignId, inputs);
  if (result.error) {
    console.error(`[admin-leads] outbound send failed campaignId=${campaignId}: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  let sentCount = 0;
  let failedCount = 0;
  for (const outcome of result.outcomes) {
    if (outcome.ok) {
      sentCount += 1;
      await prisma.leadOutreach.upsert({
        where: {
          provider_providerCampaignId_leadId: {
            provider: PROVIDER_NAME,
            providerCampaignId: campaignId,
            leadId: outcome.leadId,
          },
        },
        create: {
          leadId: outcome.leadId,
          provider: PROVIDER_NAME,
          providerCampaignId: campaignId,
          campaignName,
          providerLeadId: outcome.providerLeadId,
          status: "SENT_TO_INSTANTLY",
          sentAt: new Date(),
        },
        update: {
          providerLeadId: outcome.providerLeadId,
          status: "SENT_TO_INSTANTLY",
          sentAt: new Date(),
        },
      });
    } else {
      failedCount += 1;
      await prisma.leadOutreach.upsert({
        where: {
          provider_providerCampaignId_leadId: {
            provider: PROVIDER_NAME,
            providerCampaignId: campaignId,
            leadId: outcome.leadId,
          },
        },
        create: {
          leadId: outcome.leadId,
          provider: PROVIDER_NAME,
          providerCampaignId: campaignId,
          campaignName,
          status: "FAILED",
          failureReason: outcome.error,
        },
        update: {
          status: "FAILED",
          failureReason: outcome.error,
        },
      });
    }
  }

  console.log(
    `[admin-leads] outbound send campaignId=${campaignId} requested=${leadIds.length} eligible=${eligible.length} sent=${sentCount} failed=${failedCount} skipped=${skipped.length}`,
  );

  return NextResponse.json({
    dryRun: false,
    sentCount,
    failedCount,
    eligibleCount: eligible.length,
    skippedCount: skipped.length,
    skipped: skippedDetails,
  });
}
