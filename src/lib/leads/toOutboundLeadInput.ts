/**
 * Maps a GeoViz `Lead` row to the provider-agnostic `OutboundLeadInput`
 * shape. Pure, no I/O — only ever reads fields already on the row,
 * never invents a name/title/email/personalization data (per explicit
 * instruction). `contactName` is split into first/last on the first
 * space, a best-effort heuristic — if there's no space, the whole
 * value becomes firstName and lastName stays null rather than
 * guessing a split point.
 */

import type { Lead } from "@prisma/client";
import type { OutboundLeadInput } from "@/lib/outbound/types";

export function toOutboundLeadInput(lead: Lead): OutboundLeadInput {
  const contactName = lead.contactName?.trim() || null;
  const spaceIndex = contactName ? contactName.indexOf(" ") : -1;
  const firstName = contactName ? (spaceIndex === -1 ? contactName : contactName.slice(0, spaceIndex)) : null;
  const lastName = contactName && spaceIndex !== -1 ? contactName.slice(spaceIndex + 1).trim() || null : null;

  return {
    leadId: lead.id,
    email: lead.contactEmail!, // caller guarantees a valid email via eligibility filtering first
    firstName,
    lastName,
    companyName: lead.businessName,
    website: lead.website,
    city: lead.city,
    state: lead.state,
    phone: lead.phone,
    customVariables: {
      geoviz_lead_id: lead.id,
      geoviz_opportunity_score: lead.qualificationScore ?? null,
      city: lead.city,
      state: lead.state,
      category: lead.category,
    },
  };
}
