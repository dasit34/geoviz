/* eslint-disable no-console */
/**
 * scripts/test-monitoring-reactivation-race-db.ts — REGRESSION, against a
 * real NON-PRODUCTION PostgreSQL database (strict guard, no override).
 *
 * Runs the real monitoring webhook handler + Prisma stores (only Stripe is
 * faked) and fires two simultaneous reactivation payments for the same
 * customer + business, with every webhook event delivered twice, all at
 * once, in shuffled order. Repeated for several rounds. Proves:
 *   - one customer account
 *   - one business monitoring record (history, questions, competitors kept)
 *   - one live subscription relationship (+ the other paid subscription
 *     recorded once in the duplicate ledger)
 *   - each Stripe event processed exactly once; prior id recorded once
 * Also: two simultaneous FIRST purchases for the same email + site.
 * All rows are tagged `race-test-<run>` and deleted at the end.
 *
 *   DATABASE_URL=<staging> GEOVIZ_NONPROD_DB_HOSTS=<host> npx tsx scripts/test-monitoring-reactivation-race-db.ts
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { createFakeStripe, harness, monitoringSnapshot } from "./lib/monitoring-fakes";
import { prisma } from "../src/lib/db";
import { prismaMonitoringAuthStore } from "../src/lib/monitoring/auth/prisma-auth-store";
import { prismaMonitoringStore } from "../src/lib/monitoring/prisma-store";
import { REACTIVATES_METADATA_KEY } from "../src/lib/monitoring/types";
import { handleMonitoringStripeEvent, type WebhookDeps } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-reactivation-race-db");
const run = randomBytes(4).toString("hex");
const ROUNDS = 8;
const DAY = 86_400_000;
const rejections: string[] = [];

function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function deps(stripe: ReturnType<typeof createFakeStripe>, welcome: string[]): WebhookDeps {
  return {
    store: prismaMonitoringStore,
    stripe: stripe.gateway,
    now: () => new Date(),
    resolveBusiness: async () => ({ businessId: null, baselineAuditOrderId: null }),
    linkCustomer: async (sub) => {
      const c = await prismaMonitoringAuthStore.ensureCustomerForEmail(sub.email, sub.stripeCustomerId);
      return c ? { ...sub, customerId: c.id } : sub;
    },
    sendWelcomeEmail: async (sub) => {
      welcome.push(sub.id);
    },
  };
}

const ev = (id: string, type: string, sub: string) => ({ id, type, data: { object: { id: sub, object: "subscription" } } });
const chk = (id: string, sub: string, cs: string) => ({
  id,
  type: "checkout.session.completed",
  data: { object: { id: cs, mode: "subscription", subscription: sub } },
});

(async () => {
  console.log(`[monitoring-reactivation-race-db] running ${ROUNDS} rounds (run=${run})...`);
  const emails: string[] = [];
  try {
    for (let round = 1; round <= ROUNDS; round++) {
      await h.check(`round ${round}: concurrent double reactivation → 1 account, 1 record, 1 live subscription, 1 duplicate, events once`, async () => {
        const tag = `race-test-${run}-${round}`;
        const email = `${tag}@example.com`;
        emails.push(email);
        const site = `https://www.${tag}.example/`;
        const meta = { ...monitoringSnapshot().metadata, email, websiteUrl: site, businessName: tag };
        const stripe = createFakeStripe();
        const welcome: string[] = [];
        const d = deps(stripe, welcome);
        const old = `sub_${tag}_old`;

        // Original purchase, some history, then the subscription ends.
        stripe.set(monitoringSnapshot({ id: old, customerId: `cus_${tag}`, metadata: meta }));
        await handleMonitoringStripeEvent(chk(`evt_${tag}_buy`, old, `cs_${tag}_buy`), d);
        const original = await prisma.monitoringSubscription.findUniqueOrThrow({ where: { stripeSubscriptionId: old } });
        await prisma.trackedPrompt.createMany({
          data: [
            { subscriptionId: original.id, text: "Q1", normalizedText: `q1-${tag}`, source: "custom" },
            { subscriptionId: original.id, text: "Q2", normalizedText: `q2-${tag}`, source: "custom" },
          ],
        });
        await prisma.trackedCompetitor.create({
          data: { subscriptionId: original.id, name: "Rival", normalizedName: `rival-${tag}`, source: "customer" },
        });
        stripe.set(monitoringSnapshot({ id: old, customerId: `cus_${tag}`, status: "canceled", endedAt: new Date(), metadata: meta }));
        await handleMonitoringStripeEvent(ev(`evt_${tag}_end`, "customer.subscription.deleted", old), d);

        // Two reactivation payments land at the same moment.
        const rmeta = { ...meta, websiteUrl: `https://${tag}.example`, [REACTIVATES_METADATA_KEY]: original.id };
        const n1 = `sub_${tag}_r1`;
        const n2 = `sub_${tag}_r2`;
        for (const n of [n1, n2]) {
          stripe.set(monitoringSnapshot({ id: n, customerId: `cus_${tag}`, currentPeriodEnd: new Date(Date.now() + 30 * DAY), metadata: rmeta }));
        }
        const events = [
          ev(`evt_${tag}_r1c`, "customer.subscription.created", n1),
          ev(`evt_${tag}_r1u`, "customer.subscription.updated", n1),
          chk(`evt_${tag}_r1k`, n1, `cs_${tag}_r1`),
          ev(`evt_${tag}_r2c`, "customer.subscription.created", n2),
          ev(`evt_${tag}_r2u`, "customer.subscription.updated", n2),
          chk(`evt_${tag}_r2k`, n2, `cs_${tag}_r2`),
        ];
        const outcomes = await Promise.allSettled(shuffle([...events, ...events]).map((e) => handleMonitoringStripeEvent(e, d)));
        // A rejected delivery = HTTP 500 → Stripe retries; mimic one retry and report it.
        for (const o of outcomes) if (o.status === "rejected") rejections.push(String((o.reason as Error)?.message ?? o.reason));
        if (outcomes.some((o) => o.status === "rejected")) {
          await Promise.all(events.map((e) => handleMonitoringStripeEvent(e, d)));
        }

        const customers = await prisma.monitoringCustomer.findMany({ where: { email } });
        assert.equal(customers.length, 1, "one customer account");
        const records = await prisma.monitoringSubscription.findMany({
          where: { email },
          include: { _count: { select: { trackedPrompts: true, trackedCompetitors: true } } },
        });
        assert.equal(records.length, 1, "one business monitoring record");
        const rec = records[0]!;
        assert.equal(rec.id, original.id, "the ORIGINAL record was reused");
        assert.equal(rec.customerId, customers[0]!.id);
        assert.ok([n1, n2].includes(rec.stripeSubscriptionId), "attached to a new subscription");
        assert.equal(rec.status, "active");
        assert.deepEqual(rec.priorStripeSubscriptionIds, [old], "prior id recorded exactly once");
        assert.equal(rec._count.trackedPrompts, 2, "questions kept");
        assert.equal(rec._count.trackedCompetitors, 1, "competitors kept");
        const loser = rec.stripeSubscriptionId === n1 ? n2 : n1;
        const dups = await prisma.monitoringDuplicateSubscription.findMany({ where: { monitoringSubscriptionId: rec.id } });
        assert.equal(dups.length, 1, "exactly one duplicate ledger row");
        assert.equal(dups[0]!.stripeSubscriptionId, loser);
        assert.notEqual(rec.stripeCheckoutSessionId, `cs_${tag}_${loser === n1 ? "r1" : "r2"}`, "duplicate checkout never attached");
        const ledger = await prisma.stripeWebhookEvent.findMany({ where: { id: { startsWith: `evt_${tag}_` } } });
        assert.equal(ledger.length, events.length + 2, "each event id once in the ledger");
        assert.ok(ledger.every((l) => l.processedAt !== null), "every event processed");
        assert.equal(welcome.length, 1, "welcome email only for the original purchase");
      });
    }

    await h.check("concurrent FIRST purchases for the same email + website → one record + one duplicate", async () => {
      const tag = `race-test-${run}-first`;
      const email = `${tag}@example.com`;
      emails.push(email);
      const meta = { ...monitoringSnapshot().metadata, email, websiteUrl: `https://${tag}.example`, businessName: tag };
      const stripe = createFakeStripe();
      const welcome: string[] = [];
      const d = deps(stripe, welcome);
      const a = `sub_${tag}_a`;
      const b = `sub_${tag}_b`;
      for (const n of [a, b]) stripe.set(monitoringSnapshot({ id: n, metadata: meta }));
      const events = [chk(`evt_${tag}_ak`, a, `cs_${tag}_a`), chk(`evt_${tag}_bk`, b, `cs_${tag}_b`), ev(`evt_${tag}_ac`, "customer.subscription.created", a), ev(`evt_${tag}_bc`, "customer.subscription.created", b)];
      const outcomes = await Promise.allSettled(shuffle([...events, ...events]).map((e) => handleMonitoringStripeEvent(e, d)));
      for (const o of outcomes) if (o.status === "rejected") rejections.push(String((o.reason as Error)?.message ?? o.reason));
      if (outcomes.some((o) => o.status === "rejected")) await Promise.all(events.map((e) => handleMonitoringStripeEvent(e, d)));
      assert.equal(await prisma.monitoringSubscription.count({ where: { email } }), 1);
      assert.equal(await prisma.monitoringCustomer.count({ where: { email } }), 1);
      assert.equal(await prisma.monitoringDuplicateSubscription.count({ where: { stripeSubscriptionId: { in: [a, b] } } }), 1);
      assert.equal(welcome.length, 1);
    });
    console.log(`[monitoring-reactivation-race-db] deliveries that would have returned 500 (Stripe retries): ${rejections.length}`);
    for (const r of [...new Set(rejections)]) console.log(`    · ${r.slice(0, 160)}`);
  } finally {
    await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: `evt_race-test-${run}` } } });
    await prisma.monitoringSubscription.deleteMany({ where: { email: { in: emails } } });
    await prisma.monitoringCustomer.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  }
  h.done();
})();
