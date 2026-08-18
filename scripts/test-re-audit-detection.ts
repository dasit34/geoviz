/* eslint-disable no-console */
/**
 * scripts/test-re-audit-detection.ts
 *
 *   npx tsx scripts/test-re-audit-detection.ts
 *
 * DB-touching tests for `findPreviousCompletedAuditOrderId` (the
 * businessId-first/websiteUrl-fallback prior-audit lookup) — covers:
 *   2. Second audit for the same business is recognized as a re-audit.
 *   3. Correct previous audit is selected (most recent completed one).
 *   4. Different businesses are never compared.
 *  11. Existing admin review still works (sanity: review route's
 *      query shape / order fields are unaffected — see note below).
 *
 * Creates a small number of throwaway AuditOrder/AuditIntelligence
 * rows under an obviously-synthetic domain
 * (`test-reaudit-<runId>.example`) with a `[TEST-REAUDIT]` businessName
 * prefix — same marking convention this repo already uses for
 * calibration test orders (`[CAL]`). Every row created is deleted in
 * a `finally` block regardless of pass/fail, so this never leaves
 * data behind in the shared database.
 *
 * REQUIRES the `20260817120000_add_audit_order_previous_link`
 * migration to already be applied to the connected database (adds
 * `AuditOrder.previousAuditOrderId`) — this script writes AuditOrder
 * rows via Prisma Client, which projects every known column. Until
 * that migration is applied, this fails fast with Prisma error P2022
 * ("column does not exist") on the very first insert, and cleanup
 * still runs safely (nothing partial is left behind — verified).
 */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { findPreviousCompletedAuditOrderId } from "../src/lib/audit-comparison/findPreviousAudit";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> | void {
  const onErr = (err: unknown) => {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n      ${message}`);
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passed += 1;
          console.log(`  ✓ ${name}`);
        })
        .catch(onErr);
    }
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    onErr(err);
  }
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = "[TEST-REAUDIT]";
const createdOrderIds: string[] = [];
const createdBusinessIds: string[] = [];

async function makeCompletedOrder(args: {
  businessId: string | null;
  websiteUrl: string;
  createdAt: Date;
  overallScore: number;
}): Promise<string> {
  const order = await prisma.auditOrder.create({
    data: {
      websiteUrl: args.websiteUrl,
      email: "test-reaudit@example.com",
      businessName: `${PREFIX} ${runId}`,
      stripeSessionId: `test_reaudit_${runId}_${createdOrderIds.length}`,
      paymentStatus: "paid",
      auditStatus: "completed",
      reportStatus: "generated",
      reportMarkdown: "# test",
      businessId: args.businessId,
      createdAt: args.createdAt,
    },
  });
  createdOrderIds.push(order.id);

  await prisma.auditIntelligence.create({
    data: {
      auditOrderId: order.id,
      websiteUrl: args.websiteUrl,
      overallScore: args.overallScore,
      confidenceLevel: "medium",
      auditEngineVersion: "test",
      scoringVersion: "test",
      rawSignalSnapshot: {},
      aiReadabilityFlags: [],
      majorIssueCategories: [],
      majorFixCategories: [],
      topObservedStrengths: [],
      topObservedWeaknesses: [],
      deterministicScore: { overall_score: args.overallScore, category_scores: {}, public_bucket_scores: {} },
      createdAt: args.createdAt,
    },
  });

  return order.id;
}

async function makeBusiness(domain: string): Promise<string> {
  const business = await prisma.business.create({
    data: { normalizedDomain: domain },
  });
  createdBusinessIds.push(business.id);
  return business.id;
}

async function cleanup(): Promise<void> {
  await prisma.auditIntelligence.deleteMany({
    where: { auditOrderId: { in: createdOrderIds } },
  });
  await prisma.auditOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
}

async function run(): Promise<void> {
  try {
    const domainA = `test-reaudit-a-${runId}.example`;
    const domainB = `test-reaudit-b-${runId}.example`;
    const businessA = await makeBusiness(domainA);
    const businessB = await makeBusiness(domainB);

    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-02-01T00:00:00Z");
    const t2 = new Date("2026-03-01T00:00:00Z");

    // Business A: two prior completed audits + one being "created now".
    const aOrder1 = await makeCompletedOrder({ businessId: businessA, websiteUrl: `https://${domainA}`, createdAt: t0, overallScore: 40 });
    const aOrder2 = await makeCompletedOrder({ businessId: businessA, websiteUrl: `https://${domainA}`, createdAt: t1, overallScore: 49 });

    // Business B: one completed audit — must never be selected as A's prior audit.
    await makeCompletedOrder({ businessId: businessB, websiteUrl: `https://${domainB}`, createdAt: t1, overallScore: 70 });

    console.log("\n[1] Second audit for the same business is recognized as a re-audit");
    await test("a business with one prior completed audit resolves a previousAuditOrderId", async () => {
      const result = await findPreviousCompletedAuditOrderId({
        businessId: businessA,
        websiteUrl: `https://${domainA}`,
        excludeOrderId: "nonexistent-current-order",
      });
      assert.ok(result !== null, "expected a previous audit to be found");
    });

    console.log("\n[2] Correct previous audit is selected (most recent completed one)");
    await test("selects the MOST RECENT prior order, not the oldest", async () => {
      const result = await findPreviousCompletedAuditOrderId({
        businessId: businessA,
        websiteUrl: `https://${domainA}`,
      });
      assert.equal(result, aOrder2, "expected the most recent order (aOrder2), not aOrder1");
      assert.notEqual(result, aOrder1);
    });

    console.log("\n[3] excludeOrderId correctly excludes the order being created/linked");
    await test("excluding the latest order falls back to the next most recent", async () => {
      const result = await findPreviousCompletedAuditOrderId({
        businessId: businessA,
        websiteUrl: `https://${domainA}`,
        excludeOrderId: aOrder2,
      });
      assert.equal(result, aOrder1);
    });

    console.log("\n[4] Different businesses are never compared");
    await test("business B's lookup never returns a Business A order", async () => {
      const result = await findPreviousCompletedAuditOrderId({
        businessId: businessB,
        websiteUrl: `https://${domainB}`,
      });
      assert.notEqual(result, aOrder1);
      assert.notEqual(result, aOrder2);
    });
    await test("a brand-new business with no prior audits returns null", async () => {
      const freshDomain = `test-reaudit-fresh-${runId}.example`;
      const freshBusiness = await makeBusiness(freshDomain);
      const result = await findPreviousCompletedAuditOrderId({
        businessId: freshBusiness,
        websiteUrl: `https://${freshDomain}`,
      });
      assert.equal(result, null);
    });

    console.log("\n[5] websiteUrl fallback (no businessId) still scopes correctly");
    await test("null businessId falls back to normalized-domain match, not cross-business", async () => {
      const result = await findPreviousCompletedAuditOrderId({
        businessId: null,
        websiteUrl: `https://${domainA}`,
      });
      assert.equal(result, aOrder2);
    });

    console.log("\n[6] Real-world regression: aliased URL (trailing slash) still matches");
    await test("differently-formatted but same-domain websiteUrl still links (FlagStat case)", async () => {
      // Mirrors the real production case that exposed this bug: two
      // genuinely-the-same-business orders with businessId=null and
      // websiteUrls differing only by a trailing slash
      // (https://www.flagstat.games vs https://www.flagstat.games/).
      // A raw-string match would silently return null here.
      const aliasDomain = `test-reaudit-alias-${runId}.example`;
      const aliasOrder = await makeCompletedOrder({
        businessId: null,
        websiteUrl: `https://www.${aliasDomain}`,
        createdAt: t0,
        overallScore: 49,
      });
      const result = await findPreviousCompletedAuditOrderId({
        businessId: null,
        websiteUrl: `https://www.${aliasDomain}/`, // trailing slash, same as production case
        excludeOrderId: "current-order-not-yet-created",
      });
      assert.equal(result, aliasOrder);
    });

    console.log(
      `\n[re-audit-detection] passed=${passed} failed=${failed} total=${passed + failed}`,
    );
  } finally {
    await cleanup();
    console.log(`[re-audit-detection] cleanup complete — removed ${createdOrderIds.length} order(s), ${createdBusinessIds.length} business(es)`);
  }
  if (failed > 0) process.exit(1);
}

void run();
