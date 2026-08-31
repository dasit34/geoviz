import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { ENRICHMENT_PROVIDER_REGISTRY } from "@/lib/enrichment/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENRICHABLE_STATUSES = new Set(["QUALIFIED", "READY_FOR_CONTACT"]);

/**
 * POST /api/admin/leads/[id]/find-contact — contact enrichment.
 * Phase 1: no provider is wired (ENRICHMENT_PROVIDER_REGISTRY is
 * empty by design, see src/lib/enrichment/registry.ts), so this
 * always responds with a clean "not configured" message. Wired and
 * ready — becomes live the moment a real provider file + API key are
 * added later, with zero changes needed here. Gated to
 * QUALIFIED/READY_FOR_CONTACT leads only, per the requirement that
 * enrichment spend never happens on an unqualified lead.
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

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!ENRICHABLE_STATUSES.has(lead.status)) {
    return NextResponse.json(
      { error: "Only QUALIFIED or READY_FOR_CONTACT leads can be enriched." },
      { status: 409 },
    );
  }

  const provider = ENRICHMENT_PROVIDER_REGISTRY.find((p) => p.enabled());
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "No enrichment provider configured yet. This is a Phase 1 architecture-only stub — see src/lib/enrichment/registry.ts.",
      },
      { status: 409 },
    );
  }

  const result = await provider.findContact({
    businessName: lead.businessName,
    domain: lead.domain,
    website: lead.website,
  });

  if (!result.contact) {
    return NextResponse.json(
      { error: result.error ?? "No contact found." },
      { status: 404 },
    );
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      contactName: result.contact.contactName,
      contactTitle: result.contact.contactTitle,
      contactEmail: result.contact.contactEmail,
      contactSource: provider.name,
      enrichedAt: new Date(),
    },
  });

  console.log(`[admin-leads] enriched id=${lead.id} provider=${provider.name}`);

  return NextResponse.json({ lead: updated });
}
