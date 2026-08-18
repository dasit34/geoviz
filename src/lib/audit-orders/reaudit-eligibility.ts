import type { AuditOrder } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Single source of truth for "can a $59 re-audit be purchased against
 * this prior order?" Called from BOTH the `/re-audit` confirmation page
 * (to decide whether to show the form) and `POST /api/checkout/re-audit`
 * (to actually gate checkout-session creation) — each call independently
 * re-validates against the database. Never trust a client-supplied
 * `previousOrderId` without running this first: the confirmation page
 * having rendered a form earlier does not mean the order is still
 * eligible by the time the checkout POST arrives.
 *
 * "Belongs to the same business/domain" is deliberately NOT a separate
 * check here — it's enforced structurally by callers deriving
 * websiteUrl/businessName/email FROM the returned `previousOrder`
 * instead of accepting them as separate client input. That's what
 * actually prevents "claim eligibility from order A, audit unrelated
 * business B" — a same-domain check alone wouldn't, since the attacker
 * could always claim eligibility from a legitimate order for the exact
 * business they want to target.
 */
export type ReAuditEligibilityResult =
  | { eligible: true; previousOrder: AuditOrder }
  | { eligible: false; reason: string };

export async function validateReAuditEligibility(
  previousOrderId: string,
): Promise<ReAuditEligibilityResult> {
  const trimmed = previousOrderId.trim();
  if (!trimmed) {
    return { eligible: false, reason: "No previous audit specified." };
  }

  const previousOrder = await prisma.auditOrder.findUnique({
    where: { id: trimmed },
  });

  if (!previousOrder) {
    return { eligible: false, reason: "No matching prior GeoViz audit was found." };
  }
  if (previousOrder.paymentStatus !== "paid") {
    return { eligible: false, reason: "The prior audit was never a completed paid purchase." };
  }
  if (previousOrder.reportStatus !== "generated") {
    return { eligible: false, reason: "The prior audit report hasn't finished generating." };
  }
  if (previousOrder.reviewStatus !== "approved") {
    return { eligible: false, reason: "The prior audit hasn't cleared review yet." };
  }

  return { eligible: true, previousOrder };
}
