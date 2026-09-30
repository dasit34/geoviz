/* eslint-disable no-console */
/**
 * scripts/test-business-linking.ts
 *
 * Regression test for the Phase 1-2 business-identity layer:
 * `findOrCreateBusinessForUrl` (src/lib/business/find-or-create-business.ts)
 * and `scripts/backfill-business-identity.ts`. Mirrors
 * `scripts/test-checkout-audit-creation.ts`'s shape from earlier this
 * session — real DB, disposable marker-tagged fixtures, cleanup in a
 * `finally` block. Invokes the real backfill script as a subprocess
 * (reuses it, doesn't duplicate its logic), scoped to this test's
 * fixtures via `--filter=` so it never touches unrelated production rows.
 *
 * Requires a live DB connection — same category as
 * scripts/test-worker-recovery.ts.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { prisma } from "../src/lib/db";
import { findOrCreateBusinessForUrl } from "../src/lib/business/find-or-create-business";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${label} — ${msg}`);
    console.log(`  ✗ ${label} — ${msg}`);
  }
}

const MARKER = `test-business-linking-${Date.now()}`;
const businessIdsCreated: string[] = [];
const sessionIds: string[] = [];

function nextSessionId(suffix: string): string {
  const id = `${MARKER}-${suffix}`;
  sessionIds.push(id);
  return id;
}

async function makeFixtureOrder(websiteUrl: string, suffix: string) {
  return prisma.auditOrder.create({
    data: {
      stripeSessionId: nextSessionId(suffix),
      websiteUrl,
      email: "test-business-linking@example.invalid",
    },
  });
}

async function main(): Promise<void> {
  console.log("[business-linking] running...");

  try {
    await check("first audit for a URL creates a Business", async () => {
      const url = `https://${MARKER}-alpha.invalid`;
      const businessId = await findOrCreateBusinessForUrl(url);
      assert.ok(businessId, "expected a businessId");
      businessIdsCreated.push(businessId!);
      const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId! } });
      assert.equal(business.normalizedDomain, `${MARKER.toLowerCase()}-alpha.invalid`);
      assert.equal(business.primaryWebsiteUrl, url);
    });

    await check(
      "second audit for an equivalent (differently formatted) URL reuses the same Business",
      async () => {
        const canonical = `https://${MARKER}-beta.invalid`;
        const variant = `HTTPS://WWW.${MARKER}-Beta.invalid/`;
        const first = await findOrCreateBusinessForUrl(canonical);
        const second = await findOrCreateBusinessForUrl(variant);
        assert.ok(first);
        assert.equal(first, second, "expected the same Business.id for both URL forms");
        businessIdsCreated.push(first!);
        const count = await prisma.business.count({
          where: { normalizedDomain: `${MARKER.toLowerCase()}-beta.invalid` },
        });
        assert.equal(count, 1, "must not create a second Business row for the same domain");
      },
    );

    await check("a genuinely different domain creates a different Business", async () => {
      const urlA = `https://${MARKER}-gamma-one.invalid`;
      const urlB = `https://${MARKER}-gamma-two.invalid`;
      const idA = await findOrCreateBusinessForUrl(urlA);
      const idB = await findOrCreateBusinessForUrl(urlB);
      assert.ok(idA && idB);
      assert.notEqual(idA, idB);
      businessIdsCreated.push(idA!, idB!);
    });

    await check("backfill links historical (unlinked) fixture rows correctly", async () => {
      const url = `https://${MARKER}-delta.invalid`;
      const order = await makeFixtureOrder(url, "delta");
      assert.equal(order.businessId, null, "fixture must start unlinked");

      execFileSync(
        "npx",
        ["tsx", "scripts/backfill-business-identity.ts", "--force", `--filter=${MARKER}`],
        { stdio: "inherit" },
      );

      const linked = await prisma.auditOrder.findUniqueOrThrow({ where: { id: order.id } });
      assert.ok(linked.businessId, "expected backfill to set businessId");
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: linked.businessId! },
      });
      assert.equal(business.normalizedDomain, `${MARKER.toLowerCase()}-delta.invalid`);
      businessIdsCreated.push(linked.businessId!);
    });

    await check("rerunning backfill does not duplicate Business records", async () => {
      const url = `https://${MARKER}-epsilon.invalid`;
      const order = await makeFixtureOrder(url, "epsilon");

      execFileSync(
        "npx",
        ["tsx", "scripts/backfill-business-identity.ts", "--force", `--filter=${MARKER}`],
        { stdio: "inherit" },
      );
      const afterFirst = await prisma.auditOrder.findUniqueOrThrow({ where: { id: order.id } });
      assert.ok(afterFirst.businessId);
      businessIdsCreated.push(afterFirst.businessId!);

      // Second run: this order already has businessId set, so it's no
      // longer a candidate (where: {businessId: null}) — must be a
      // pure no-op for it, and must not create a duplicate Business row.
      execFileSync(
        "npx",
        ["tsx", "scripts/backfill-business-identity.ts", "--force", `--filter=${MARKER}`],
        { stdio: "inherit" },
      );
      const afterSecond = await prisma.auditOrder.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(afterSecond.businessId, afterFirst.businessId, "businessId must not change");

      const count = await prisma.business.count({
        where: { normalizedDomain: `${MARKER.toLowerCase()}-epsilon.invalid` },
      });
      assert.equal(count, 1, "rerunning backfill must not duplicate the Business row");
    });

    await check("ambiguous/unparseable websiteUrl is left unlinked, never guessed", async () => {
      // Contains MARKER so --filter picks it up, but is not a parseable
      // domain (no dot after normalization) — normalizeDomain() must
      // return null for this, and the backfill must skip it, not guess.
      const order = await makeFixtureOrder(`not-a-real-url-${MARKER}`, "unparseable");

      execFileSync(
        "npx",
        ["tsx", "scripts/backfill-business-identity.ts", "--force", `--filter=${MARKER}`],
        { stdio: "inherit" },
      );

      const stillUnlinked = await prisma.auditOrder.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(stillUnlinked.businessId, null, "unparseable URL must stay unlinked");
    });
  } finally {
    await prisma.auditOrder.deleteMany({
      where: { stripeSessionId: { in: sessionIds } },
    });
    const uniqueBusinessIds = [...new Set(businessIdsCreated)];
    if (uniqueBusinessIds.length > 0) {
      await prisma.business.deleteMany({
        where: { id: { in: uniqueBusinessIds } },
      });
    }
  }

  console.log(`[business-linking] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[business-linking] unexpected error:", err);
  process.exit(1);
});
