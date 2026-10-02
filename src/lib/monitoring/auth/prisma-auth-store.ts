/**
 * Prisma implementation of `MonitoringAuthStore`.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { normalizeEmail } from "./tokens";
import type { MonitoringAuthStore, MonitoringCustomerRecord } from "./types";

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const customerSelect = { id: true, email: true, stripeCustomerId: true, lastSignInAt: true, createdAt: true } as const;

async function upsertCustomer(email: string): Promise<MonitoringCustomerRecord> {
  try {
    return await prisma.monitoringCustomer.upsert({ where: { email }, create: { email }, update: {}, select: customerSelect });
  } catch (err) {
    // Concurrent create of the same email — the other writer won.
    if (!isUniqueViolation(err)) throw err;
    return prisma.monitoringCustomer.findUniqueOrThrow({ where: { email }, select: customerSelect });
  }
}

let rateLimitCalls = 0;

export const prismaMonitoringAuthStore: MonitoringAuthStore = {
  async findCustomerByEmail(email) {
    return prisma.monitoringCustomer.findUnique({ where: { email: normalizeEmail(email) }, select: customerSelect });
  },

  async findCustomerById(id) {
    return prisma.monitoringCustomer.findUnique({ where: { id }, select: customerSelect });
  },

  async ensureCustomerForEmail(rawEmail, stripeCustomerId) {
    const email = normalizeEmail(rawEmail);
    const subscriptions = await prisma.monitoringSubscription.count({ where: { email } });
    if (subscriptions === 0) {
      // No monitoring purchase under this email. An account that already
      // exists (e.g. its email was moved by an operator) still signs in.
      const existing = await prisma.monitoringCustomer.findUnique({ where: { email }, select: customerSelect });
      if (!existing) return null;
      const owned = await prisma.monitoringSubscription.count({ where: { customerId: existing.id } });
      return owned > 0 ? existing : null;
    }
    let customer = await upsertCustomer(email);
    if (!customer.stripeCustomerId && stripeCustomerId) {
      customer = await prisma.monitoringCustomer.update({
        where: { id: customer.id },
        data: { stripeCustomerId },
        select: customerSelect,
      });
    }
    // Link only unlinked rows; a row an operator moved to another account stays put.
    await prisma.monitoringSubscription.updateMany({ where: { email, customerId: null }, data: { customerId: customer.id } });
    return customer;
  },

  async issueLoginToken({ customerId, tokenHash, purpose, expiresAt, now }) {
    await prisma.$transaction([
      prisma.monitoringLoginToken.updateMany({
        where: { customerId, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      }),
      prisma.monitoringLoginToken.create({ data: { customerId, tokenHash, purpose, expiresAt, createdAt: now } }),
    ]);
  },

  async consumeLoginToken(tokenHash, now) {
    const { count } = await prisma.monitoringLoginToken.updateMany({
      where: { tokenHash, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (count !== 1) return null;
    const row = await prisma.monitoringLoginToken.findUnique({ where: { tokenHash }, select: { customerId: true } });
    return row ? { customerId: row.customerId } : null;
  },

  async createSession({ customerId, tokenHash, expiresAt, now, userAgent }) {
    await prisma.monitoringSession.create({
      data: { customerId, tokenHash, expiresAt, lastSeenAt: now, createdAt: now, userAgent },
    });
  },

  async findActiveSession(tokenHash, now) {
    const s = await prisma.monitoringSession.findUnique({
      where: { tokenHash },
      select: { id: true, customerId: true, expiresAt: true, lastSeenAt: true, revokedAt: true },
    });
    if (!s || s.revokedAt || s.expiresAt.getTime() <= now.getTime()) return null;
    return { sessionId: s.id, customerId: s.customerId, expiresAt: s.expiresAt, lastSeenAt: s.lastSeenAt };
  },

  async touchSession(sessionId, now) {
    await prisma.monitoringSession.update({ where: { id: sessionId }, data: { lastSeenAt: now } });
  },

  async revokeSession(tokenHash, now) {
    await prisma.monitoringSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: now } });
  },

  async revokeAllSessions(customerId, now) {
    const { count } = await prisma.monitoringSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  },

  async markSignedIn(customerId, now) {
    await prisma.monitoringCustomer.update({ where: { id: customerId }, data: { lastSignInAt: now } });
  },

  async hitRateLimit(key, windowStart) {
    // Occasional cleanup of finished windows keeps the table small.
    if (++rateLimitCalls % 50 === 0) {
      await prisma.monitoringAuthRateLimit
        .deleteMany({ where: { windowStart: { lt: new Date(windowStart.getTime() - 2 * 24 * 60 * 60_000) } } })
        .catch(() => undefined);
    }
    const bump = () =>
      prisma.monitoringAuthRateLimit.upsert({
        where: { key_windowStart: { key, windowStart } },
        create: { key, windowStart, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
    try {
      return (await bump()).count;
    } catch (err) {
      // Two first-hits raced on the insert; the retry increments.
      if (!isUniqueViolation(err)) throw err;
      return (await bump()).count;
    }
  },
};
