import type { AuditOrder } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findOrCreateBusinessForUrl } from "@/lib/business/find-or-create-business";
import { findPreviousCompletedAuditOrderId } from "@/lib/audit-comparison/findPreviousAudit";
import { validateReAuditEligibility } from "@/lib/audit-orders/reaudit-eligibility";

/**
 * The subset of a Stripe Checkout Session this module actually reads.
 * Kept minimal and explicit (rather than taking a full `Stripe.Checkout.Session`)
 * so both the webhook handler and the offline recovery script can build one
 * without depending on exactly how each obtained the session.
 */
export type CheckoutCompletionInput = {
  id: string;
  metadata: Record<string, string> | null | undefined;
  payment_status: string;
  amount_total: number | null | undefined;
  currency: string | null | undefined;
  customer_details_email?: string | null;
  customer_email?: string | null;
};

export type CreateResult =
  | { outcome: "created"; order: AuditOrder; queued: boolean }
  | { outcome: "already_exists"; order: AuditOrder }
  | { outcome: "skipped_missing_metadata" };

/**
 * Single source of truth for "does this completed Checkout Session count as
 * a valid, payable GeoViz audit order?" Used by both the Stripe webhook and
 * the manual recovery script — do not duplicate this check elsewhere.
 *
 * Deliberately does NOT read amount_total, coupon/promotion code, or price
 * ID: a session is either completed ("paid") or completed with nothing to
 * collect ("no_payment_required" — Stripe's status for a payment-mode
 * session a 100%-off coupon discounts to $0). Any other status (e.g.
 * "unpaid") is not a completed order.
 */
function isCompletedCheckout(paymentStatus: string): boolean {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

/**
 * Creates (and, if the completion criteria above are met, queues) an
 * AuditOrder from a completed Stripe Checkout Session. Idempotent on
 * `stripeSessionId`: calling this twice for the same session id is safe —
 * the second call returns `already_exists` and performs no writes, so
 * webhook retries and manual replays via the recovery script can never
 * create a duplicate order.
 */
export async function createAuditOrderFromCheckoutSession(
  session: CheckoutCompletionInput,
): Promise<CreateResult> {
  const existing = await prisma.auditOrder.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing) {
    return { outcome: "already_exists", order: existing };
  }

  const metadata = session.metadata ?? {};
  const websiteUrl = metadata.websiteUrl ?? "";
  const email =
    metadata.email ??
    session.customer_details_email ??
    session.customer_email ??
    "";
  const businessName = metadata.businessName || null;
  const competitorUrl = metadata.competitorUrl || null;

  if (!websiteUrl || !email) {
    console.error(
      `[audit-orders] missing websiteUrl or email in metadata for session=${session.id}`,
    );
    return { outcome: "skipped_missing_metadata" };
  }

  const paid = isCompletedCheckout(session.payment_status);

  // Business-identity linking (Phase 1-2 monitoring foundation). Fails
  // soft and deliberately: a business-linking problem must never block
  // a paying customer's checkout → audit pipeline. businessId simply
  // stays null on failure, same as it does for unbackfilled historic
  // rows and other not-yet-wired creation paths.
  let businessId: string | null = null;
  try {
    businessId = await findOrCreateBusinessForUrl(websiteUrl);
  } catch (err) {
    console.warn(
      `[audit-orders] business linking failed for session=${session.id} (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }

  // Re-Audit / Verification Audit detection (additive; same fail-soft
  // contract as business linking above — a lookup problem here must
  // never block checkout). businessId-first with websiteUrl fallback,
  // same pattern already proven in audit-intelligence.ts. Simply
  // stays null when there's no prior completed audit, or when the
  // lookup itself fails for any reason.
  let previousAuditOrderId: string | null = null;
  try {
    previousAuditOrderId = await findPreviousCompletedAuditOrderId({
      businessId,
      websiteUrl,
    });
  } catch (err) {
    console.warn(
      `[audit-orders] previous-audit lookup failed for session=${session.id} (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }

  // $59 Re-Audit purchase (additive; same fail-soft contract as the
  // linking above — a re-validation problem here must never block a
  // paying customer's order). `metadata.previousOrderId` was set
  // server-side at checkout-session creation from a validated order
  // (see /api/checkout/re-audit) — re-checked here defensively since
  // the referenced order's state could theoretically change in the
  // window between checkout creation and webhook delivery. On success
  // this OVERRIDES the auto-detected previousAuditOrderId above with
  // the authoritative, purchase-time-validated one (normally the same
  // order anyway). On failure, falls back to whatever auto-detection
  // above already found rather than blocking order creation.
  let orderType: string | null = null;
  if (metadata.productType === "RE_AUDIT" && metadata.previousOrderId) {
    try {
      const reAuditEligibility = await validateReAuditEligibility(metadata.previousOrderId);
      if (reAuditEligibility.eligible) {
        orderType = "RE_AUDIT";
        previousAuditOrderId = reAuditEligibility.previousOrder.id;
      } else {
        console.warn(
          `[audit-orders] re-audit purchase re-validation failed for session=${session.id} reason="${reAuditEligibility.reason}" — order still created, falling back to auto-detected previousAuditOrderId`,
        );
      }
    } catch (err) {
      console.warn(
        `[audit-orders] re-audit eligibility re-check errored for session=${session.id} (non-fatal):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const order = await prisma.auditOrder.create({
    data: {
      stripeSessionId: session.id,
      websiteUrl,
      email,
      businessName,
      competitorUrl,
      amount: session.amount_total ?? 9700,
      currency: session.currency ?? "usd",
      paymentStatus: paid ? "paid" : "pending",
      auditStatus: "pending",
      businessId,
      previousAuditOrderId,
      orderType,
    },
  });

  if (previousAuditOrderId) {
    console.log(
      `[audit-orders] re-audit detected id=${order.id} previousAuditOrderId=${previousAuditOrderId}`,
    );
  }

  console.log(
    `[audit-orders] order created id=${order.id} payment=${order.paymentStatus}`,
  );

  let queued = false;
  if (paid) {
    // Eligible: fresh order, `reportStatus` still at its "pending" default.
    // Guarded by id so this can never touch a different row; kept as an
    // atomic `updateMany` (rather than folding into the `create` above) to
    // match the webhook's existing queue-promotion shape exactly.
    const promoted = await prisma.auditOrder.updateMany({
      where: {
        id: order.id,
        reportStatus: { in: ["pending", "failed"] },
      },
      data: {
        reportStatus: "queued",
        reportQueuedAt: new Date(),
        reportError: null,
      },
    });
    queued = promoted.count > 0;
    if (queued) {
      console.log(`[audit-orders] order queued id=${order.id}`);
    }
  }

  return { outcome: "created", order, queued };
}
