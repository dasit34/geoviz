/**
 * Prisma implementation of `MonitoringStore` + the business resolver.
 */
import { Prisma } from "@prisma/client";

import { findPreviousCompletedAuditOrderId } from "@/lib/audit-comparison/findPreviousAudit";
import { findOrCreateBusinessForUrl } from "@/lib/business/find-or-create-business";
import { prisma } from "@/lib/db";

import {
  DuplicateBusinessRecordError,
  DuplicateSubscriptionError,
  MONITORING_ORDER_TYPE,
  type MonitoringStore,
  type MonitoringSubscriptionRecord,
} from "./types";

const SCHEDULABLE_STATUSES = ["active", "trialing"];
const IN_FLIGHT_REPORT_STATUSES = ["pending", "queued", "running"];

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** True when a P2002 came from the (email, siteKey) business-identity index. */
function isBusinessKeyViolation(err: unknown): boolean {
  if (!isUniqueViolation(err)) return false;
  const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return text.includes("siteKey");
}

export const prismaMonitoringStore: MonitoringStore = {
  async findBySubscriptionId(stripeSubscriptionId) {
    return prisma.monitoringSubscription.findUnique({ where: { stripeSubscriptionId } });
  },

  async findByPriorSubscriptionId(stripeSubscriptionId) {
    return prisma.monitoringSubscription.findFirst({ where: { priorStripeSubscriptionIds: { has: stripeSubscriptionId } } });
  },

  async findById(id) {
    return prisma.monitoringSubscription.findUnique({ where: { id } });
  },

  async findByEmail(email) {
    return prisma.monitoringSubscription.findMany({ where: { email }, orderBy: { createdAt: "desc" }, take: 50 });
  },

  async findBySiteKey(email, siteKey) {
    return prisma.monitoringSubscription.findUnique({ where: { email_siteKey: { email, siteKey } } });
  },

  async claimSiteKey(id, siteKey) {
    try {
      const { count } = await prisma.monitoringSubscription.updateMany({ where: { id, siteKey: null }, data: { siteKey } });
      return count === 1;
    } catch (err) {
      if (isBusinessKeyViolation(err)) return false;
      throw err;
    }
  },

  async recordDuplicateSubscription({ stripeSubscriptionId, monitoringSubscriptionId, stripeCustomerId, status, now }) {
    const write = () =>
      prisma.monitoringDuplicateSubscription.upsert({
        where: { stripeSubscriptionId },
        create: { stripeSubscriptionId, monitoringSubscriptionId, stripeCustomerId, status, detectedAt: now, lastEventAt: now },
        update: { status, lastEventAt: now },
      });
    try {
      await write();
    } catch (err) {
      // Two events for the same duplicate raced on the insert; the retry updates.
      if (!isUniqueViolation(err)) throw err;
      await write();
    }
  },

  async findDuplicateSubscription(stripeSubscriptionId) {
    return prisma.monitoringDuplicateSubscription.findUnique({
      where: { stripeSubscriptionId },
      select: { monitoringSubscriptionId: true },
    });
  },

  async reattach(id, fromStripeSubscriptionId, toStripeSubscriptionId, patch) {
    // Conditional on the record still pointing at the old subscription, so
    // exactly one concurrent event performs the reattach.
    try {
      const { count } = await prisma.monitoringSubscription.updateMany({
        where: { id, stripeSubscriptionId: fromStripeSubscriptionId },
        data: {
          ...patch,
          stripeSubscriptionId: toStripeSubscriptionId,
          priorStripeSubscriptionIds: { push: fromStripeSubscriptionId },
        },
      });
      if (count !== 1) return null;
    } catch (err) {
      // The new id already exists on some record — the race was lost.
      if (isUniqueViolation(err)) return null;
      throw err;
    }
    return prisma.monitoringSubscription.findUnique({ where: { id } });
  },

  async create(data) {
    try {
      return await prisma.monitoringSubscription.create({ data });
    } catch (err) {
      if (isBusinessKeyViolation(err)) throw new DuplicateBusinessRecordError(data.siteKey ?? data.websiteUrl);
      if (isUniqueViolation(err)) throw new DuplicateSubscriptionError(data.stripeSubscriptionId);
      throw err;
    }
  },

  async updateBilling(id, patch) {
    return prisma.monitoringSubscription.update({ where: { id }, data: patch });
  },

  async setCheckoutSessionId(id, sessionId) {
    await prisma.monitoringSubscription.update({ where: { id }, data: { stripeCheckoutSessionId: sessionId } });
  },

  async claimWelcomeEmail(id, at) {
    const { count } = await prisma.monitoringSubscription.updateMany({
      where: { id, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: at },
    });
    return count === 1;
  },

  async recordEventAttempt(eventId, type) {
    const row = await prisma.stripeWebhookEvent.upsert({
      where: { id: eventId },
      create: { id: eventId, type, attempts: 1 },
      update: { attempts: { increment: 1 } },
    });
    return { alreadyProcessed: row.processedAt !== null };
  },

  async markEventProcessed(eventId, at) {
    await prisma.stripeWebhookEvent.update({ where: { id: eventId }, data: { processedAt: at, lastError: null } });
  },

  async markEventFailed(eventId, error) {
    await prisma.stripeWebhookEvent.update({ where: { id: eventId }, data: { lastError: error } });
  },

  async findDue(now, limit) {
    return prisma.monitoringSubscription.findMany({
      where: { status: { in: SCHEDULABLE_STATUSES }, nextAuditAt: { lte: now } },
      orderBy: { nextAuditAt: "asc" },
      take: limit,
    });
  },

  async hasInFlightAudit(subscriptionId) {
    const n = await prisma.auditOrder.count({
      where: { monitoringSubscriptionId: subscriptionId, reportStatus: { in: IN_FLIGHT_REPORT_STATUSES } },
    });
    return n > 0;
  },

  async createScheduledAuditOrder({ subscription, stripeSessionId, queuedAt }) {
    // Chain to the most recent completed audit for the same business so
    // the existing verification/comparison surfaces light up.
    let previousAuditOrderId: string | null = null;
    try {
      previousAuditOrderId = await findPreviousCompletedAuditOrderId({
        businessId: subscription.businessId,
        websiteUrl: subscription.websiteUrl,
      });
    } catch (err) {
      console.warn("[monitoring-scheduler] previous-audit lookup failed (non-fatal):", err);
    }
    try {
      const order = await prisma.auditOrder.create({
        data: {
          websiteUrl: subscription.websiteUrl,
          email: subscription.email,
          businessName: subscription.businessName,
          stripeSessionId,
          amount: 0,
          orderType: MONITORING_ORDER_TYPE,
          paymentStatus: "paid",
          reportStatus: "queued",
          reportQueuedAt: queuedAt,
          monitoringSubscriptionId: subscription.id,
          adminNotes: `Scheduled monitoring re-audit (subscription ${subscription.id}).`,
          ...(subscription.businessId ? { businessId: subscription.businessId } : {}),
          ...(previousAuditOrderId ? { previousAuditOrderId } : {}),
        },
        select: { id: true },
      });
      return { outcome: "created", orderId: order.id };
    } catch (err) {
      if (isUniqueViolation(err)) return { outcome: "already_exists" };
      throw err;
    }
  },

  async advanceSchedule(id, nextAuditAt, queuedAt) {
    await prisma.monitoringSubscription.update({ where: { id }, data: { nextAuditAt, lastAuditQueuedAt: queuedAt } });
  },
};

/** Business identity + baseline audit for a newly subscribed site (fail-soft pieces). */
export async function resolveMonitoringBusiness(websiteUrl: string) {
  const businessId = await findOrCreateBusinessForUrl(websiteUrl).catch(() => null);
  const baselineAuditOrderId = await findPreviousCompletedAuditOrderId({ businessId, websiteUrl }).catch(
    () => null,
  );
  return { businessId, baselineAuditOrderId };
}

export async function findSubscriptionByToken(token: string): Promise<MonitoringSubscriptionRecord | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return prisma.monitoringSubscription.findUnique({ where: { accessToken: token } });
}

/** Audits shown on the status page: this subscription's re-audits + its baseline. */
export async function loadStatusAuditRows(sub: MonitoringSubscriptionRecord) {
  const orders = await prisma.auditOrder.findMany({
    where: {
      OR: [
        { monitoringSubscriptionId: sub.id },
        ...(sub.baselineAuditOrderId ? [{ id: sub.baselineAuditOrderId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 36,
    select: {
      id: true,
      createdAt: true,
      reportStatus: true,
      reviewStatus: true,
      previousAuditOrderId: true,
      intelligence: { select: { overallScore: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    createdAt: o.createdAt,
    reportStatus: o.reportStatus,
    reviewStatus: o.reviewStatus,
    previousAuditOrderId: o.previousAuditOrderId,
    overallScore: o.intelligence?.overallScore ?? null,
    isBaseline: o.id === sub.baselineAuditOrderId,
  }));
}
