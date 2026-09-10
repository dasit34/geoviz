import { normalizeDomain } from "@/lib/business/normalize-domain";

import type {
  EligibilityContext,
  EligibilityLead,
  EligibilityResult,
} from "./types";

/**
 * Lead statuses that block a bulk audit outright. Per the product
 * decision, ANY lead with a website is otherwise eligible (we do not
 * gate on qualification) — but never audit a lead the operator has
 * explicitly parked.
 */
const BLOCKED_STATUSES: ReadonlySet<string> = new Set([
  "DO_NOT_CONTACT",
  "CLOSED",
]);

/**
 * Decide whether a single lead should get a market-study audit.
 * Pure — the caller pre-computes the `EligibilityContext` sets with
 * one query each. Skip reasons are customer-facing (shown in the
 * confirmation preview and stored on the skipped entry).
 */
export function classifyLeadForAudit(
  lead: EligibilityLead,
  ctx: EligibilityContext,
): EligibilityResult {
  const rawUrl = (lead.website ?? "").trim();
  if (!rawUrl) {
    return { eligible: false, skipReason: "No website on file" };
  }

  const normalizedDomain = lead.domain?.trim() || normalizeDomain(rawUrl);
  if (!normalizedDomain) {
    return { eligible: false, skipReason: "Website URL could not be parsed" };
  }

  if (BLOCKED_STATUSES.has(lead.status)) {
    return {
      eligible: false,
      skipReason: `Lead status is ${lead.status}`,
    };
  }

  if (ctx.studyLeadIds.has(lead.id)) {
    return { eligible: false, skipReason: "Already in this study" };
  }

  if (ctx.recentlyAuditedLeadIds.has(lead.id)) {
    return {
      eligible: false,
      skipReason: "Audited in a market study within the last 30 days",
    };
  }

  if (ctx.seenDomains.has(normalizedDomain)) {
    return {
      eligible: false,
      skipReason: "Duplicate domain in this selection",
    };
  }

  const websiteUrl = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;

  return { eligible: true, websiteUrl, normalizedDomain };
}
