/**
 * Checkout prevention: may this buyer start a NEW monitoring checkout for
 * this business? Only when GeoViz has no monitoring record for (email,
 * business). Live, canceling-at-period-end, payment-issue and ended records
 * all block a new purchase — the live ones are managed (and ended ones
 * reactivated) only from the signed-in dashboard. A checkout already in
 * flight for the business is handled by the checkout lease.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

import { siteKeyFor } from "./subscription-sync";
import type { MonitoringStore, MonitoringSubscriptionRecord } from "./types";

const ENDED = new Set(["canceled", "incomplete_expired"]);

export type PurchaseDecision =
  | { allowed: true; siteKey: string }
  | { allowed: false; siteKey: string; reason: "already_monitored" | "reactivate_from_dashboard"; message: string };

export function purchaseDecision(existing: Pick<MonitoringSubscriptionRecord, "status"> | null, siteKey: string): PurchaseDecision {
  if (!existing) return { allowed: true, siteKey };
  if (ENDED.has(existing.status)) {
    return {
      allowed: false,
      siteKey,
      reason: "reactivate_from_dashboard",
      message: "You already have monitoring history for this website. Sign in to reactivate it — your questions, competitors, and history are kept.",
    };
  }
  return {
    allowed: false,
    siteKey,
    reason: "already_monitored",
    message: "Monitoring is already set up for this website with this email. Sign in to manage it.",
  };
}

export async function checkNewPurchase(
  email: string,
  websiteUrl: string,
  store: Pick<MonitoringStore, "findBySiteKey" | "findByEmail">,
): Promise<PurchaseDecision> {
  const normalizedEmail = email.trim().toLowerCase();
  const siteKey = siteKeyFor(websiteUrl);
  const keyed = await store.findBySiteKey(normalizedEmail, siteKey);
  if (keyed) return purchaseDecision(keyed, siteKey);
  // Legacy rows not yet keyed (backfill covers them; this is belt and braces).
  const site = normalizeDomain(websiteUrl);
  const legacy = (await store.findByEmail(normalizedEmail)).find((r) => r.siteKey === null && site !== null && normalizeDomain(r.websiteUrl) === site);
  return purchaseDecision(legacy ?? null, siteKey);
}
