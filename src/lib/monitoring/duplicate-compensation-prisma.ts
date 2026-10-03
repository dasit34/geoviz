/**
 * Production wiring for duplicate-billing compensation: Prisma ledger store,
 * Stripe billing gateway (API 2025-02-24.acacia via the shared client), and
 * Resend notices.
 */
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { getResend } from "@/lib/resend";
import { getStripe } from "@/lib/stripe";

import {
  COMPENSATION_CLAIM_STALE_MS,
  buildCompensationEmail,
  type CompensationDeps,
  type DuplicateBillingGateway,
  type DuplicateLedgerStore,
  type HistoryEntry,
} from "./duplicate-compensation";

const rowSelect = {
  id: true, stripeSubscriptionId: true, monitoringSubscriptionId: true, stripeCustomerId: true,
  compensatedAt: true, canceledInStripeAt: true, refundStatus: true,
} as const;

export const prismaDuplicateLedgerStore: DuplicateLedgerStore = {
  async claim(stripeSubscriptionId, now) {
    const { count } = await prisma.monitoringDuplicateSubscription.updateMany({
      where: {
        stripeSubscriptionId,
        compensatedAt: null,
        resolvedAt: null,
        OR: [{ compensationClaimedAt: null }, { compensationClaimedAt: { lt: new Date(now.getTime() - COMPENSATION_CLAIM_STALE_MS) } }],
      },
      data: { compensationClaimedAt: now },
    });
    if (count !== 1) return null;
    return prisma.monitoringDuplicateSubscription.findUnique({ where: { stripeSubscriptionId }, select: rowSelect });
  },

  async release(id, error) {
    await prisma.monitoringDuplicateSubscription.update({ where: { id }, data: { compensationClaimedAt: null, lastError: error } });
  },

  async canonical(monitoringSubscriptionId) {
    return prisma.monitoringSubscription.findUnique({
      where: { id: monitoringSubscriptionId },
      select: { id: true, stripeSubscriptionId: true, priorStripeSubscriptionIds: true, email: true, websiteUrl: true, businessName: true },
    });
  },

  async markCanceled(id, now) {
    await prisma.monitoringDuplicateSubscription.updateMany({ where: { id, canceledInStripeAt: null }, data: { canceledInStripeAt: now } });
  },

  async recordRefunds(id, r) {
    await prisma.monitoringDuplicateSubscription.update({
      where: { id },
      data: { refundStatus: r.status, refundedAmount: r.amount, refundCurrency: r.currency, ...(r.refundIds.length ? { stripeRefundIds: { push: r.refundIds } } : {}) },
    });
  },

  async claimNotification(id, kind, now) {
    const field = kind === "customer" ? "customerNotifiedAt" : "adminNotifiedAt";
    const { count } = await prisma.monitoringDuplicateSubscription.updateMany({ where: { id, [field]: null }, data: { [field]: now } });
    return count === 1;
  },

  async unclaimNotification(id, kind) {
    const field = kind === "customer" ? "customerNotifiedAt" : "adminNotifiedAt";
    await prisma.monitoringDuplicateSubscription.update({ where: { id }, data: { [field]: null } });
  },

  async markCompensated(id, now) {
    await prisma.monitoringDuplicateSubscription.update({ where: { id }, data: { compensatedAt: now, compensationClaimedAt: null, lastError: null } });
  },

  async appendHistory(id, entry: HistoryEntry) {
    // Atomic JSONB append — safe alongside other writers to the row.
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "MonitoringDuplicateSubscription" SET "history" = "history" || ${JSON.stringify([entry])}::jsonb WHERE "id" = ${id}`,
    );
  },
};

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

export function stripeDuplicateBillingGateway(stripe: Stripe = getStripe()): DuplicateBillingGateway {
  return {
    async subscriptionStatus(id) {
      return (await stripe.subscriptions.retrieve(id)).status;
    },
    async cancelSubscription(id, idempotencyKey) {
      await stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false }, { idempotencyKey });
    },
    async collectedPayments(id) {
      const out: Array<{ invoiceId: string; paymentIntentId: string | null; amountPaid: number; currency: string }> = [];
      for await (const inv of stripe.invoices.list({ subscription: id, status: "paid", limit: 100 })) {
        out.push({ invoiceId: inv.id, paymentIntentId: idOf(inv.payment_intent), amountPaid: inv.amount_paid, currency: inv.currency });
      }
      return out;
    },
    async refundedAmount(paymentIntentId) {
      let total = 0;
      for await (const r of stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
        if (r.status === "succeeded" || r.status === "pending" || r.status === "requires_action") total += r.amount;
      }
      return total;
    },
    async refund({ paymentIntentId, amount, idempotencyKey, metadata }) {
      const r = await stripe.refunds.create({ payment_intent: paymentIntentId, amount, reason: "duplicate", metadata }, { idempotencyKey });
      return { id: r.id, amount: r.amount };
    },
  };
}

const FROM_FALLBACK = "GeoViz <orders@mail.geoviz.ai>";

export function compensationDeps(baseUrl: string): CompensationDeps {
  return {
    ledger: prismaDuplicateLedgerStore,
    billing: stripeDuplicateBillingGateway(),
    adminEmail: process.env.AUDIT_NOTIFICATION_EMAIL?.trim() || null,
    now: () => new Date(),
    notify: async (notice) => {
      if (!process.env.RESEND_API_KEY || !notice.email) throw new Error("email not configured");
      const { subject, text } = buildCompensationEmail(notice, `${baseUrl.replace(/\/+$/, "")}/monitoring/sign-in`);
      const from = process.env.RESEND_EMAIL_FROM?.trim() || FROM_FALLBACK;
      const res = await getResend().emails.send({ from, to: notice.email, subject, text });
      if (res.error) throw new Error(`resend: ${res.error.message}`);
      console.log(`[monitoring-duplicate] ${notice.to} notice sent resendId=${res.data?.id ?? "?"}`);
    },
  };
}
