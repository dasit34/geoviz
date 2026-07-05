/* eslint-disable no-console */
/**
 * scripts/test-worker-recovery.ts
 *
 * Regression test for the existing stale-job recovery path
 * (scripts/recover-stale-jobs.ts, and the equivalent inline
 * recoverStaleRunningJobs() the worker itself already runs at startup
 * and periodically during its loop). Proves:
 *   - a genuinely stale "running" row gets reset to "queued" with a
 *     recovery breadcrumb;
 *   - a fresh "running" row (not yet past the staleness cutoff) is
 *     left untouched — recovery must not steal an in-flight job;
 *   - recovery never creates a duplicate AuditOrder row (it only
 *     updates existing rows; stripeSessionId stays unique throughout).
 *
 * Invokes the real script as a subprocess (reuses it — does not
 * duplicate its query logic), scoped to disposable fixture rows via
 * `--filter=`, and cleans them up afterward.
 *
 * Requires a live DB connection — same category as `report:validate:live`.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { prisma } from "../src/lib/db";

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

// Mirrors scripts/recover-stale-jobs.ts's own staleness threshold.
const TIMEOUT_MS = Number(process.env.GEO_WORKER_TIMEOUT_MS ?? 300_000);
const STALE_AFTER_MS = TIMEOUT_MS + 2 * 60_000;

const MARKER = `test-worker-recovery-${Date.now()}`;
const STALE_SESSION_ID = `${MARKER}-stale`;
const FRESH_SESSION_ID = `${MARKER}-fresh`;

async function main(): Promise<void> {
  console.log("[worker-recovery] running...");

  const staleFixture = await prisma.auditOrder.create({
    data: {
      websiteUrl: `https://${MARKER}-stale.invalid`,
      email: "test-worker-recovery@example.invalid",
      stripeSessionId: STALE_SESSION_ID,
      reportStatus: "running",
      reportStartedAt: new Date(Date.now() - STALE_AFTER_MS - 60_000),
    },
  });

  const freshFixture = await prisma.auditOrder.create({
    data: {
      websiteUrl: `https://${MARKER}-fresh.invalid`,
      email: "test-worker-recovery@example.invalid",
      stripeSessionId: FRESH_SESSION_ID,
      reportStatus: "running",
      reportStartedAt: new Date(),
    },
  });

  try {
    execFileSync(
      "npx",
      ["tsx", "scripts/recover-stale-jobs.ts", `--filter=${MARKER}`],
      { stdio: "inherit" },
    );

    await check("stale row recovered to queued with a breadcrumb", async () => {
      const row = await prisma.auditOrder.findUniqueOrThrow({
        where: { id: staleFixture.id },
      });
      assert.equal(row.reportStatus, "queued");
      assert.match(row.reportError ?? "", /Recovered from "running" state/);
      assert.ok(row.reportQueuedAt, "reportQueuedAt should be stamped");
    });

    await check("fresh (non-stale) row is left untouched", async () => {
      const row = await prisma.auditOrder.findUniqueOrThrow({
        where: { id: freshFixture.id },
      });
      assert.equal(row.reportStatus, "running");
      assert.equal(row.reportError, null);
    });

    await check("no duplicate AuditOrder rows were created", async () => {
      const staleCount = await prisma.auditOrder.count({
        where: { stripeSessionId: STALE_SESSION_ID },
      });
      const freshCount = await prisma.auditOrder.count({
        where: { stripeSessionId: FRESH_SESSION_ID },
      });
      assert.equal(staleCount, 1);
      assert.equal(freshCount, 1);
    });

    await check("recovery never duplicates the row on a second run", async () => {
      // This runs against the real (shared) database, where a live worker
      // may legitimately claim the now-"queued" fixture between the two
      // invocations below — that's expected concurrent behavior, not a
      // bug, so this check deliberately does NOT assert a specific
      // reportStatus value here (that would be flaky against real worker
      // activity). recover-stale-jobs.ts's WHERE clause only ever matches
      // reportStatus="running" rows and only ever updates in place — it
      // is structurally incapable of inserting a new row — so the one
      // property that must hold regardless of any concurrent claim is
      // that exactly one row still exists for this stripeSessionId.
      execFileSync(
        "npx",
        ["tsx", "scripts/recover-stale-jobs.ts", `--filter=${MARKER}`],
        { stdio: "inherit" },
      );
      const staleCount = await prisma.auditOrder.count({
        where: { stripeSessionId: STALE_SESSION_ID },
      });
      assert.equal(staleCount, 1, "re-running recovery must not duplicate the row");
    });
  } finally {
    await prisma.auditOrder.deleteMany({
      where: { stripeSessionId: { in: [STALE_SESSION_ID, FRESH_SESSION_ID] } },
    });
  }

  console.log(`[worker-recovery] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[worker-recovery] unexpected error:", err);
  process.exit(1);
});
