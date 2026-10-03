/**
 * Duplicate-billing compensation — the webhook layer of defense in depth.
 *
 * When a paid monitoring Stripe subscription loses to the canonical one
 * already attached to the business's record (subscription-sync.ts →
 * MonitoringDuplicateSubscription), GeoViz automatically and exactly once:
 *   1. cancels the DUPLICATE Stripe subscription (immediately, no proration),
 *   2. fully refunds every payment the duplicate subscription itself
 *      collected (its own paid invoices → their PaymentIntents),
 *   3. emails the customer and the admin (no links, no secrets),
 * recording each step in the ledger row's history.
 *
 * Safety rules:
 * - The canonical subscription is never cancelled or refunded: before any
 *   Stripe write the record is re-read, and if the subscription is the
 *   record's current OR a prior subscription, compensation aborts.
 * - Exactly once: a DB claim serializes concurrent webhook deliveries;
 *   cancellation is skipped when Stripe already reports it canceled; each
 *   refund is for (amount paid − amount already refunded, read from
 *   Stripe) with a per-invoice idempotency key. Re-running after a crash or
 *   redelivery can't refund twice.
 * - Ambiguity is never guessed: a paid invoice without a PaymentIntent
 *   (credit balance, out-of-band payment) is not auto-refunded — the row is
 *   marked `needs_manual_refund` for the operator.
 */
import type { MonitoringSubscriptionRecord } from "./types";

export const COMPENSATION_CLAIM_STALE_MS = 2 * 60_000;

export type DuplicateLedgerRow = {
  id: string;
  stripeSubscriptionId: string;
  monitoringSubscriptionId: string;
  stripeCustomerId: string | null;
  compensatedAt: Date | null;
  canceledInStripeAt: Date | null;
  refundStatus: string;
};

export type HistoryEntry = { at: string; action: string; detail?: string };

export interface DuplicateLedgerStore {
  /** Claim for compensation; null if already compensated, operator-resolved, or claimed by a live run. */
  claim(stripeSubscriptionId: string, now: Date): Promise<DuplicateLedgerRow | null>;
  release(id: string, error: string): Promise<void>;
  canonical(monitoringSubscriptionId: string): Promise<Pick<
    MonitoringSubscriptionRecord,
    "id" | "stripeSubscriptionId" | "priorStripeSubscriptionIds" | "email" | "websiteUrl" | "businessName"
  > | null>;
  markCanceled(id: string, now: Date): Promise<void>;
  recordRefunds(id: string, r: { status: string; amount: number; currency: string | null; refundIds: string[] }): Promise<void>;
  /** Atomic once-only claim of a notification; true for the single winner. */
  claimNotification(id: string, kind: "customer" | "admin", now: Date): Promise<boolean>;
  unclaimNotification(id: string, kind: "customer" | "admin"): Promise<void>;
  markCompensated(id: string, now: Date): Promise<void>;
  appendHistory(id: string, entry: HistoryEntry): Promise<void>;
}

export type CollectedPayment = {
  invoiceId: string;
  paymentIntentId: string | null;
  amountPaid: number;
  currency: string;
};

export interface DuplicateBillingGateway {
  subscriptionStatus(stripeSubscriptionId: string): Promise<string>;
  /** Cancel immediately (no proration, no final invoice). Idempotency-keyed. */
  cancelSubscription(stripeSubscriptionId: string, idempotencyKey: string): Promise<void>;
  /** The duplicate subscription's own PAID invoices. */
  collectedPayments(stripeSubscriptionId: string): Promise<CollectedPayment[]>;
  /** Already refunded (succeeded + pending) for this PaymentIntent, read from Stripe. */
  refundedAmount(paymentIntentId: string): Promise<number>;
  refund(args: { paymentIntentId: string; amount: number; idempotencyKey: string; metadata: Record<string, string> }): Promise<{ id: string; amount: number }>;
}

export type CompensationNotice = {
  to: "customer" | "admin";
  email: string | null;
  websiteUrl: string;
  businessName: string | null;
  recordId: string;
  canonicalSubscriptionId: string;
  duplicateSubscriptionId: string;
  refundedAmount: number;
  currency: string | null;
  refundStatus: string;
};

export type CompensationDeps = {
  ledger: DuplicateLedgerStore;
  billing: DuplicateBillingGateway;
  notify: (notice: CompensationNotice) => Promise<void>;
  adminEmail: string | null;
  now: () => Date;
};

export type CompensationResult =
  | { outcome: "compensated"; refundedAmount: number; refundStatus: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "aborted"; reason: string };

const ENDED = new Set(["canceled", "incomplete_expired"]);

export async function compensateDuplicate(stripeSubscriptionId: string, deps: CompensationDeps): Promise<CompensationResult> {
  const row = await deps.ledger.claim(stripeSubscriptionId, deps.now());
  if (!row) return { outcome: "skipped", reason: "already compensated, resolved, or in progress" };
  const log = (action: string, detail?: string) =>
    deps.ledger.appendHistory(row.id, { at: deps.now().toISOString(), action, ...(detail ? { detail } : {}) });

  try {
    const record = await deps.ledger.canonical(row.monitoringSubscriptionId);
    if (
      !record ||
      record.stripeSubscriptionId === stripeSubscriptionId ||
      record.priorStripeSubscriptionIds.includes(stripeSubscriptionId)
    ) {
      await log("aborted", "subscription is attached to the record — never cancel or refund it");
      await deps.ledger.release(row.id, "aborted: subscription is canonical/prior");
      return { outcome: "aborted", reason: "subscription is attached to the record" };
    }

    // 1. Cancel the duplicate (skip if Stripe already reports it ended).
    const status = await deps.billing.subscriptionStatus(stripeSubscriptionId);
    if (!ENDED.has(status)) {
      await deps.billing.cancelSubscription(stripeSubscriptionId, `geoviz-dup-cancel-${stripeSubscriptionId}`);
      await log("canceled_duplicate_subscription", stripeSubscriptionId);
    } else if (!row.canceledInStripeAt) {
      await log("duplicate_already_canceled_in_stripe", status);
    }
    await deps.ledger.markCanceled(row.id, deps.now());

    // 2. Refund what the duplicate itself collected — remaining amount only.
    const payments = await deps.billing.collectedPayments(stripeSubscriptionId);
    const refundIds: string[] = [];
    let refunded = 0;
    let currency: string | null = null;
    let needsManual = false;
    for (const p of payments) {
      currency = p.currency;
      if (p.amountPaid <= 0) continue;
      if (!p.paymentIntentId) {
        needsManual = true;
        await log("needs_manual_refund", `invoice ${p.invoiceId} was paid without a PaymentIntent`);
        continue;
      }
      const already = await deps.billing.refundedAmount(p.paymentIntentId);
      const remaining = p.amountPaid - already;
      if (remaining > 0) {
        const r = await deps.billing.refund({
          paymentIntentId: p.paymentIntentId,
          amount: remaining,
          idempotencyKey: `geoviz-dup-refund-${p.invoiceId}`,
          metadata: {
            geoviz_reason: "duplicate_monitoring_subscription",
            duplicate_subscription: stripeSubscriptionId,
            canonical_subscription: record.stripeSubscriptionId,
            monitoring_record: record.id,
          },
        });
        refundIds.push(r.id);
        await log("refunded", `${r.id} ${r.amount} ${p.currency} (invoice ${p.invoiceId})`);
      } else {
        await log("refund_already_present", `invoice ${p.invoiceId}`);
      }
      refunded += Math.min(p.amountPaid, already + Math.max(remaining, 0));
    }
    const refundStatus = needsManual ? "needs_manual_refund" : payments.some((p) => p.amountPaid > 0) ? "refunded" : "nothing_to_refund";
    await deps.ledger.recordRefunds(row.id, { status: refundStatus, amount: refunded, currency, refundIds });

    // 3. Notify customer + admin — once each.
    const base = {
      websiteUrl: record.websiteUrl,
      businessName: record.businessName,
      recordId: record.id,
      canonicalSubscriptionId: record.stripeSubscriptionId,
      duplicateSubscriptionId: stripeSubscriptionId,
      refundedAmount: refunded,
      currency,
      refundStatus,
    };
    for (const to of ["customer", "admin"] as const) {
      const email = to === "customer" ? record.email : deps.adminEmail;
      if (!email) {
        await log(`${to}_notice_skipped`, "no recipient configured");
        continue;
      }
      if (!(await deps.ledger.claimNotification(row.id, to, deps.now()))) continue;
      try {
        await deps.notify({ ...base, to, email });
        await log(`${to}_notified`);
      } catch (err) {
        await deps.ledger.unclaimNotification(row.id, to);
        throw err;
      }
    }

    await deps.ledger.markCompensated(row.id, deps.now());
    await log("compensated", refundStatus);
    return { outcome: "compensated", refundedAmount: refunded, refundStatus };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log("error", message.slice(0, 300)).catch(() => undefined);
    await deps.ledger.release(row.id, message.slice(0, 500)).catch(() => undefined);
    throw err;
  }
}

const money = (amount: number, currency: string | null) =>
  `${(amount / 100).toFixed(2)} ${(currency ?? "usd").toUpperCase()}`;

/** Plain-text notices — no links with credentials, no Stripe secrets. */
export function buildCompensationEmail(n: CompensationNotice, signInUrl: string): { subject: string; text: string } {
  const site = n.businessName || n.websiteUrl;
  if (n.to === "customer") {
    const refundLine =
      n.refundStatus === "refunded"
        ? `We canceled the duplicate subscription and refunded ${money(n.refundedAmount, n.currency)} to your original payment method. Refunds usually appear within 5–10 business days.`
        : n.refundStatus === "nothing_to_refund"
          ? "We canceled the duplicate subscription. It had not collected any payment, so there is nothing to refund."
          : "We canceled the duplicate subscription. Our team is completing the refund for this payment and will confirm by email.";
    return {
      subject: `Duplicate GeoViz monitoring payment refunded — ${site}`,
      text: [
        `We noticed a second AI visibility monitoring subscription was paid for ${n.websiteUrl}.`,
        "",
        refundLine,
        "",
        "Your monitoring continues on your original subscription — nothing else changes and you don't need to do anything.",
        "",
        `Reference: ${n.duplicateSubscriptionId}`,
        `You can review billing any time after signing in at ${signInUrl}`,
        "",
        "— GeoViz",
      ].join("\n"),
    };
  }
  return {
    subject: `[GeoViz] Duplicate monitoring subscription auto-compensated — ${site}`,
    text: [
      "A duplicate paid monitoring subscription was detected and compensated automatically.",
      "",
      `Record:          ${n.recordId} (${n.websiteUrl})`,
      `Canonical sub:   ${n.canonicalSubscriptionId} (untouched)`,
      `Duplicate sub:   ${n.duplicateSubscriptionId} (canceled)`,
      `Refund status:   ${n.refundStatus}`,
      `Refunded:        ${money(n.refundedAmount, n.currency)}`,
      "",
      "Details and history: /admin/monitoring-customers",
    ].join("\n"),
  };
}
