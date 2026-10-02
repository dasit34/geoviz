/**
 * Prisma verification store. Claims are compare-and-set; a completed check
 * and the resulting task transition are written in one transaction.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import type { Expectation } from "./drafts";
import type { ClaimedVerification, VerificationStore } from "./verify";

const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

export const prismaVerificationStore: VerificationStore = {
  async requeueStale(before, now) {
    const { count } = await prisma.improvementVerification.updateMany({
      where: { status: "running", claimedAt: { lt: before } },
      data: { status: "queued", claimedAt: null, nextRetryAt: now, lastError: "runner stopped mid-check; re-queued" },
    });
    return count;
  },

  async claimNext(now, { subscriptionId, fixtures }) {
    for (let tries = 0; tries < 5; tries += 1) {
      const c = await prisma.improvementVerification.findFirst({
        where: { status: "queued", isFixture: fixtures === true, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }], ...(subscriptionId ? { subscriptionId } : {}) },
        orderBy: { createdAt: "asc" },
        select: { id: true, attempts: true },
      });
      if (!c) return null;
      const { count } = await prisma.improvementVerification.updateMany({
        where: { id: c.id, status: "queued", attempts: c.attempts },
        data: { status: "running", claimedAt: now, attempts: { increment: 1 } },
      });
      if (count === 1) {
        const r = await prisma.improvementVerification.findUniqueOrThrow({ where: { id: c.id } });
        return { id: r.id, taskId: r.taskId, subscriptionId: r.subscriptionId, url: r.url, expected: r.expected as Expectation, attempts: r.attempts, isFixture: r.isFixture } satisfies ClaimedVerification;
      }
    }
    return null;
  },

  async complete({ v, evaluation, fetchStatus, now }) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.improvementVerification.updateMany({
        where: { id: v.id, status: "running" },
        data: { status: "done", outcome: evaluation.outcome, observed: json({ expected: evaluation.expected, observed: evaluation.observed }), fetchStatus, checkedAt: now, nextRetryAt: null },
      });
      if (count !== 1) return;
      await tx.improvementEvent.create({
        data: { taskId: v.taskId, actor: "system", type: "verification", note: `${evaluation.outcome}: ${evaluation.observed}`.slice(0, 500), detail: json({ verificationId: v.id, url: v.url, ...evaluation }) },
      });
      if (evaluation.outcome === "verified") {
        const moved = await tx.improvementTask.updateMany({
          where: { id: v.taskId, status: "implemented" },
          data: { status: "verified", verifiedAt: now, verifiedBy: "scanner", openKey: null },
        });
        if (moved.count === 1) {
          await tx.improvementEvent.create({ data: { taskId: v.taskId, actor: "system", type: "status_changed", fromStatus: "implemented", toStatus: "verified", note: "Website scanner found the expected change." } });
        }
      }
    });
  },

  async scheduleRetry({ v, error, nextRetryAt }) {
    await prisma.improvementVerification.updateMany({ where: { id: v.id, status: "running" }, data: { status: "queued", claimedAt: null, nextRetryAt, lastError: error.slice(0, 300) } });
  },
};
