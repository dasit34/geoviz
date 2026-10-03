/**
 * Prisma implementation of `CheckoutLeaseStore`.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import type { CheckoutLeaseRow, CheckoutLeaseStore } from "./checkout-lease";

const select = {
  leaseKey: true, email: true, siteKey: true, kind: true, monitoringSubscriptionId: true, status: true,
  attempt: true, stripeCheckoutSessionId: true, checkoutUrl: true, expiresAt: true,
} as const;

export const prismaCheckoutLeaseStore: CheckoutLeaseStore = {
  async get(leaseKey) {
    return prisma.monitoringCheckoutLease.findUnique({ where: { leaseKey }, select });
  },

  async insert(row) {
    try {
      await prisma.monitoringCheckoutLease.create({ data: row });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
  },

  async takeover(leaseKey, expectedAttempt, now, next) {
    const { count } = await prisma.monitoringCheckoutLease.updateMany({
      where: { leaseKey, attempt: expectedAttempt, OR: [{ status: { not: "open" } }, { expiresAt: { lte: now } }] },
      data: next,
    });
    if (count !== 1) return null;
    return prisma.monitoringCheckoutLease.findUnique({ where: { leaseKey }, select }) as Promise<CheckoutLeaseRow | null>;
  },

  async attachSession(leaseKey, attempt, sessionId, url) {
    await prisma.monitoringCheckoutLease.updateMany({
      where: { leaseKey, attempt, status: "open" },
      data: { stripeCheckoutSessionId: sessionId, checkoutUrl: url },
    });
  },

  async completeBySession(sessionId) {
    await prisma.monitoringCheckoutLease.updateMany({ where: { stripeCheckoutSessionId: sessionId }, data: { status: "completed" } });
  },

  async release(leaseKey, attempt) {
    await prisma.monitoringCheckoutLease.updateMany({ where: { leaseKey, attempt, status: "open" }, data: { status: "released" } });
  },
};
