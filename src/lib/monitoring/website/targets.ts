/**
 * Which sites a subscription's website tracking scans, and the rules for a
 * competitor's website (pure).
 *
 * A competitor is scanned ONLY when its website was supplied by the
 * customer or an operator (`domainConfirmedAt` set). Competitors detected
 * in AI answers carry no domain, and a domain is never inferred from a
 * business name.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

import type { WebsiteTrackingEntitlement } from "../plans";
import { checkUrlShape } from "./safe-fetch";

export type ScanTarget = {
  siteKind: "customer" | "competitor";
  siteDomain: string;
  siteUrl: string;
  trackedCompetitorId: string | null;
  label: string;
};

export type CompetitorSiteRow = {
  id: string;
  name: string;
  websiteUrl: string | null;
  domain: string | null;
  domainConfirmedAt: Date | null;
  isActive: boolean;
};

export function scanTargets(args: {
  customer: { websiteUrl: string; businessName: string | null };
  competitors: CompetitorSiteRow[];
  entitlement: WebsiteTrackingEntitlement;
}): { targets: ScanTarget[]; skipped: Array<{ id: string; name: string; reason: string }> } {
  const skipped: Array<{ id: string; name: string; reason: string }> = [];
  if (!args.entitlement.enabled) return { targets: [], skipped };
  const targets: ScanTarget[] = [];
  const customerDomain = normalizeDomain(args.customer.websiteUrl);
  if (customerDomain && checkUrlShape(withScheme(args.customer.websiteUrl)).ok) {
    targets.push({ siteKind: "customer", siteDomain: customerDomain, siteUrl: `https://${hostOf(args.customer.websiteUrl)}/`, trackedCompetitorId: null, label: args.customer.businessName || customerDomain });
  }
  const seen = new Set(customerDomain ? [customerDomain] : []);
  for (const c of args.competitors) {
    if (!c.isActive) continue;
    if (!c.websiteUrl || !c.domain || !c.domainConfirmedAt) {
      skipped.push({ id: c.id, name: c.name, reason: "no confirmed website" });
      continue;
    }
    if (seen.has(c.domain) || !checkUrlShape(withScheme(c.websiteUrl)).ok) {
      skipped.push({ id: c.id, name: c.name, reason: "website not scannable" });
      continue;
    }
    if (targets.length - 1 >= args.entitlement.maxCompetitorSites) {
      skipped.push({ id: c.id, name: c.name, reason: "plan limit" });
      continue;
    }
    seen.add(c.domain);
    targets.push({ siteKind: "competitor", siteDomain: c.domain, siteUrl: `https://${hostOf(c.websiteUrl)}/`, trackedCompetitorId: c.id, label: c.name });
  }
  return { targets, skipped };
}

const withScheme = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
const hostOf = (u: string) => new URL(withScheme(u)).hostname.toLowerCase();

export type CompetitorWebsiteDecision =
  | { ok: true; websiteUrl: string; domain: string }
  | { ok: false; message: string };

/** Validate a website the customer supplies for a competitor. */
export function decideCompetitorWebsite(args: {
  websiteUrl: string;
  customerWebsiteUrl: string;
  otherCompetitorDomains: string[];
}): CompetitorWebsiteDecision {
  const raw = args.websiteUrl.trim();
  if (!raw || raw.length > 300) return { ok: false, message: "Enter the competitor's website address." };
  const shape = checkUrlShape(withScheme(raw));
  if (!shape.ok) return { ok: false, message: "That website address can't be scanned. Use a public address like example.com." };
  const domain = normalizeDomain(shape.url.toString());
  if (!domain) return { ok: false, message: "Enter the competitor's website address." };
  if (domain === normalizeDomain(args.customerWebsiteUrl)) return { ok: false, message: "That's your own website." };
  if (args.otherCompetitorDomains.includes(domain)) return { ok: false, message: "Another tracked competitor already uses that website." };
  return { ok: true, websiteUrl: `https://${shape.url.hostname.toLowerCase()}/`, domain };
}
