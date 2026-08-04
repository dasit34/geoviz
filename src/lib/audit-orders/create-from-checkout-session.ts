import type { AuditOrder } from "@prisma/client";
import { prisma } from "@/lib/db";

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
    },
  });

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
