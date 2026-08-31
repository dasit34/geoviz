/**
 * Shared contact-enrichment orchestration — factored out of
 * `find-contact/route.ts` so the new bulk `enrich-batch/route.ts`
 * doesn't duplicate it. Mirrors how `qualifyLead()` is already reused
 * by both `/qualify` and `/qualify-batch`.
 *
 * Guards enforced here (Phase 3 additions on top of Phase 1's
 * status gate):
 *   - Requires a website OR domain on the lead — enrichment is never
 *     attempted (never spends provider credit) on a lead with nothing
 *     to look up.
 *   - Backfill-only writes — never overwrites an existing non-null
 *     contactEmail/contactName/contactTitle with a new value. Matches
 *     `src/lib/leads/dedupe.ts`'s existing "never overwrite with a
 *     lower-confidence source" philosophy; no quality-scoring system
 *     invented, just "don't clobber what's already there."
 */

import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENRICHMENT_PROVIDER_REGISTRY } from "@/lib/enrichment/registry";

const ENRICHABLE_STATUSES = new Set(["QUALIFIED", "READY_FOR_CONTACT"]);

export type EnrichOneLeadResult =
  | { ok: true; lead: Lead }
  | { ok: false; status: number; error: string };

export async function enrichOneLead(leadId: string): Promise<EnrichOneLeadResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, status: 404, error: "Lead not found" };

  if (!ENRICHABLE_STATUSES.has(lead.status)) {
    return {
      ok: false,
      status: 409,
      error: "Only QUALIFIED or READY_FOR_CONTACT leads can be enriched.",
    };
  }
  if (!lead.domain && !lead.website) {
    return { ok: false, status: 409, error: "Lead has no website/domain to enrich." };
  }

  const provider = ENRICHMENT_PROVIDER_REGISTRY.find((p) => p.enabled());
  if (!provider) {
    return {
      ok: false,
      status: 409,
      error: "No enrichment provider configured yet.",
    };
  }

  const result = await provider.findContact({
    businessName: lead.businessName,
    domain: lead.domain,
    website: lead.website,
  });

  if (!result.contact) {
    return { ok: false, status: 404, error: result.error ?? "No contact found." };
  }

  const data: Record<string, unknown> = { enrichedAt: new Date() };
  if (!lead.contactEmail && result.contact.contactEmail) {
    data.contactEmail = result.contact.contactEmail;
    data.contactSource = provider.name;
  }
  if (!lead.contactName && result.contact.contactName) {
    data.contactName = result.contact.contactName;
  }
  if (!lead.contactTitle && result.contact.contactTitle) {
    data.contactTitle = result.contact.contactTitle;
  }
  if (result.contact.alternateEmails && result.contact.alternateEmails.length > 0) {
    data.contactAlternateEmails = result.contact.alternateEmails;
  }
  if (result.contact.socials && Object.keys(result.contact.socials).length > 0) {
    data.contactSocials = result.contact.socials;
  }

  const updated = await prisma.lead.update({ where: { id: lead.id }, data });
  console.log(`[admin-leads] enriched id=${lead.id} provider=${provider.name}`);

  return { ok: true, lead: updated };
}
