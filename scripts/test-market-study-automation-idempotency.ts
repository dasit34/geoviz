/* eslint-disable no-console */
/**
 * scripts/test-market-study-automation-idempotency.ts
 *
 * Regression test for the daily Market Study automation's overlap /
 * duplicate-run guard: `claimDailyRun()` in
 * src/lib/market-studies/automation/runTick.ts. Real DB, disposable
 * far-future `runDate` fixtures (never collides with real automation
 * data, which will never reach the year 2099), cleanup in a `finally`
 * block — same shape as scripts/test-business-linking.ts.
 *
 * Does NOT call discovery/qualify/enqueue (`executeKickoff`) — this
 * test is scoped to the claim/retry state machine only, so it never
 * hits Outscraper or creates real Leads/AuditOrders.
 *
 * Requires a live DB connection.
 */
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { claimDailyRun } from "@/lib/market-studies/automation/runTick";
import type { DailyAutomationConfig } from "@/lib/market-studies/automation/config";

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

function testConfig(overrides: Partial<DailyAutomationConfig> = {}): DailyAutomationConfig {
  return {
    enabled: true,
    batchSize: 50,
    runHourUtc: 13,
    industries: ["hvac"],
    locations: [{ city: "Columbus", state: "OH" }],
    discoveryProvider: "outscraper",
    qualifyConcurrency: 3,
    maxRetries: 2,
    costCeilingUsd: null,
    recipientEmail: null,
    ...overrides,
  };
}

// Far-future, per-test-run-unique base so this never collides with
// real automation data or a previous (possibly crashed) test run.
const BASE_MS = Date.UTC(2099, 0, 1) + (Date.now() % 10_000_000);
function testRunDate(offsetIndex: number): Date {
  return new Date(BASE_MS + offsetIndex * 86_400_000);
}

const selection = { industry: "hvac", city: "Columbus", state: "OH" as string | null };
const runIdsCreated: string[] = [];

async function main(): Promise<void> {
  console.log("[market-study-automation-idempotency] running...");

  try {
    await check("first claim for a new day creates a running run", async () => {
      const runDate = testRunDate(1);
      const config = testConfig();
      const run = await claimDailyRun(prisma, config, runDate, selection);
      assert.ok(run, "expected a claimed run");
      runIdsCreated.push(run!.id);
      assert.equal(run!.status, "running");
      assert.equal(run!.retryCount, 0);
      assert.equal(run!.industry, "hvac");
    });

    await check("a second claim for the SAME day while still running is a clean no-op", async () => {
      const runDate = testRunDate(2);
      const config = testConfig();
      const first = await claimDailyRun(prisma, config, runDate, selection);
      assert.ok(first);
      runIdsCreated.push(first!.id);

      const second = await claimDailyRun(prisma, config, runDate, selection);
      assert.equal(second, null, "a running run for today must never be double-claimed");

      const count = await prisma.marketStudyAutomationRun.count({ where: { runDate } });
      assert.equal(count, 1, "exactly one row must exist for this runDate — no duplicate created");
    });

    await check("a claim after a transient failure retries the SAME row (idempotent retry)", async () => {
      const runDate = testRunDate(3);
      const config = testConfig({ maxRetries: 2 });
      const first = await claimDailyRun(prisma, config, runDate, selection);
      assert.ok(first);
      runIdsCreated.push(first!.id);

      await prisma.marketStudyAutomationRun.update({
        where: { id: first!.id },
        data: { status: "failed", lastError: "simulated transient provider error" },
      });

      const retried = await claimDailyRun(prisma, config, runDate, selection);
      assert.ok(retried, "expected a retry claim to succeed under the retry budget");
      assert.equal(retried!.id, first!.id, "a retry must reuse the SAME row, never create a second one");
      assert.equal(retried!.status, "running");
      assert.equal(retried!.retryCount, 1, "retryCount increments by exactly one per retry");

      const count = await prisma.marketStudyAutomationRun.count({ where: { runDate } });
      assert.equal(count, 1, "a retry must never create a duplicate row");
    });

    await check("retries stop once the retry budget is exhausted", async () => {
      const runDate = testRunDate(4);
      const config = testConfig({ maxRetries: 1 });
      const first = await claimDailyRun(prisma, config, runDate, selection);
      assert.ok(first);
      runIdsCreated.push(first!.id);

      // Exhaust the single allowed retry.
      await prisma.marketStudyAutomationRun.update({
        where: { id: first!.id },
        data: { status: "failed" },
      });
      const retried = await claimDailyRun(prisma, config, runDate, selection);
      assert.ok(retried);
      assert.equal(retried!.retryCount, 1);

      // Fail again — retryCount (1) is no longer < maxRetries (1).
      await prisma.marketStudyAutomationRun.update({
        where: { id: retried!.id },
        data: { status: "failed" },
      });
      const noMoreRetries = await claimDailyRun(prisma, config, runDate, selection);
      assert.equal(noMoreRetries, null, "must stop retrying once the budget is exhausted, not retry forever");
    });

    await check("a completed run for the day is never re-claimed", async () => {
      const runDate = testRunDate(5);
      const config = testConfig();
      const first = await claimDailyRun(prisma, config, runDate, selection);
      assert.ok(first);
      runIdsCreated.push(first!.id);
      await prisma.marketStudyAutomationRun.update({
        where: { id: first!.id },
        data: { status: "completed", completedAt: new Date() },
      });

      const reclaimed = await claimDailyRun(prisma, config, runDate, selection);
      assert.equal(reclaimed, null, "a completed day must stay completed — no re-run");
    });
  } finally {
    if (runIdsCreated.length > 0) {
      await prisma.marketStudyAutomationRun.deleteMany({ where: { id: { in: runIdsCreated } } });
    }
  }

  console.log(`[market-study-automation-idempotency] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("[market-study-automation-idempotency] unexpected error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
