/* eslint-disable no-console */
/**
 * scripts/test-monitoring-auth-store.ts — DATABASE-BACKED checks of the
 * Prisma monitoring-login store against a NON-PRODUCTION database (strict
 * guard, no override): atomic single-use consume under concurrency, newer
 * link invalidation, session revoke/expiry, the fixed-window rate-limit
 * counter under concurrency, lazy account linking, and the atomic
 * reactivation reattach. Creates rows tagged `authstore-test-<run>` and
 * deletes them at the end.
 *
 *   DATABASE_URL=<staging> GEOVIZ_NONPROD_DB_HOSTS=<host> npx tsx scripts/test-monitoring-auth-store.ts
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { harness } from "./lib/monitoring-fakes";
import { prisma } from "../src/lib/db";
import { prismaMonitoringAuthStore as store } from "../src/lib/monitoring/auth/prisma-auth-store";
import { generateSecret, hashSecret } from "../src/lib/monitoring/auth/tokens";
import { prismaMonitoringStore } from "../src/lib/monitoring/prisma-store";

const h = harness("monitoring-auth-store");
const run = randomBytes(4).toString("hex");
const email = `authstore-test-${run}@example.com`;
const now = () => new Date();

async function makeSub(id: string, status = "active") {
  return prisma.monitoringSubscription.create({
    data: {
      accessToken: `authstore_${run}_${id}_${randomBytes(8).toString("hex")}`,
      planKey: "monthly",
      stripeSubscriptionId: `sub_authstore_${run}_${id}`,
      status,
      websiteUrl: `https://authstore-${run}.example`,
      email,
      cadenceDays: 30,
    },
  });
}

(async () => {
  console.log(`[monitoring-auth-store] running (run=${run})...`);
  try {
    const subA = await makeSub("a");
    const subB = await makeSub("b", "canceled");

    let customerId = "";
    await h.check("ensureCustomerForEmail creates one account and links every subscription with that email", async () => {
      const [c1, c2] = await Promise.all([store.ensureCustomerForEmail(email, "cus_x"), store.ensureCustomerForEmail(email.toUpperCase())]);
      assert.ok(c1 && c2 && c1.id === c2.id, "one account under concurrency");
      customerId = c1!.id;
      const linked = await prisma.monitoringSubscription.findMany({ where: { email }, select: { customerId: true } });
      assert.ok(linked.every((l) => l.customerId === customerId));
      assert.equal(await store.ensureCustomerForEmail(`nobody-${run}@example.com`), null, "no monitoring → no account");
    });

    await h.check("consumeLoginToken is atomic: 8 concurrent consumers → exactly 1 succeeds", async () => {
      const secret = generateSecret();
      await store.issueLoginToken({ customerId, tokenHash: hashSecret(secret), purpose: "sign_in", expiresAt: new Date(Date.now() + 60_000), now: now() });
      const results = await Promise.all(Array.from({ length: 8 }, () => store.consumeLoginToken(hashSecret(secret), now())));
      assert.equal(results.filter(Boolean).length, 1);
    });

    await h.check("issuing a new link invalidates older unused ones; expired links never consume", async () => {
      const old = generateSecret();
      const fresh = generateSecret();
      await store.issueLoginToken({ customerId, tokenHash: hashSecret(old), purpose: "welcome", expiresAt: new Date(Date.now() + 3_600_000), now: now() });
      await store.issueLoginToken({ customerId, tokenHash: hashSecret(fresh), purpose: "sign_in", expiresAt: new Date(Date.now() + 60_000), now: now() });
      assert.equal(await store.consumeLoginToken(hashSecret(old), now()), null);
      assert.ok(await store.consumeLoginToken(hashSecret(fresh), now()));
      const expired = generateSecret();
      await store.issueLoginToken({ customerId, tokenHash: hashSecret(expired), purpose: "sign_in", expiresAt: new Date(Date.now() - 1), now: now() });
      assert.equal(await store.consumeLoginToken(hashSecret(expired), now()), null);
    });

    await h.check("sessions: found while valid; gone after revoke or expiry", async () => {
      const s1 = generateSecret();
      await store.createSession({ customerId, tokenHash: hashSecret(s1), expiresAt: new Date(Date.now() + 60_000), now: now(), userAgent: "t" });
      assert.equal((await store.findActiveSession(hashSecret(s1), now()))?.customerId, customerId);
      await store.revokeSession(hashSecret(s1), now());
      assert.equal(await store.findActiveSession(hashSecret(s1), now()), null);
      const s2 = generateSecret();
      await store.createSession({ customerId, tokenHash: hashSecret(s2), expiresAt: new Date(Date.now() - 1), now: now(), userAgent: null });
      assert.equal(await store.findActiveSession(hashSecret(s2), now()), null);
      const s3 = generateSecret();
      await store.createSession({ customerId, tokenHash: hashSecret(s3), expiresAt: new Date(Date.now() + 60_000), now: now(), userAgent: null });
      assert.ok((await store.revokeAllSessions(customerId, now())) >= 1);
      assert.equal(await store.findActiveSession(hashSecret(s3), now()), null);
    });

    await h.check("rate-limit counter: 20 concurrent hits on one window → counts 1..20 exactly once each", async () => {
      const key = `authstore-test-${run}`;
      const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
      const counts = await Promise.all(Array.from({ length: 20 }, () => store.hitRateLimit(key, windowStart)));
      assert.deepEqual([...counts].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
    });

    await h.check("reattach is atomic: two concurrent reattaches of the same ended record → one wins", async () => {
      const patch = { status: "active", stripeCustomerId: "cus_x", stripePriceId: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, canceledAt: null, endedAt: null, lastSyncedAt: now() };
      const [r1, r2] = await Promise.all([
        prismaMonitoringStore.reattach(subB.id, subB.stripeSubscriptionId, `sub_authstore_${run}_new1`, patch),
        prismaMonitoringStore.reattach(subB.id, subB.stripeSubscriptionId, `sub_authstore_${run}_new2`, patch),
      ]);
      assert.equal([r1, r2].filter(Boolean).length, 1);
      const after = await prisma.monitoringSubscription.findUniqueOrThrow({ where: { id: subB.id } });
      assert.deepEqual(after.priorStripeSubscriptionIds, [subB.stripeSubscriptionId]);
      assert.equal((await prismaMonitoringStore.findByPriorSubscriptionId(subB.stripeSubscriptionId))?.id, subB.id);
    });

    void subA;
  } finally {
    await prisma.monitoringAuthRateLimit.deleteMany({ where: { key: `authstore-test-${run}` } });
    await prisma.monitoringSubscription.deleteMany({ where: { email } });
    await prisma.monitoringCustomer.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
  h.done();
})();
