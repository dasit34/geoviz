/* eslint-disable no-console */
/**
 * scripts/intelligence-cost-summary.ts
 *
 * Internal read-only inspection — prints a one-screen summary of
 * per-audit token + cost telemetry persisted on `AuditOrder` by the
 * Phase 1 / 1.5 worker integration. Pure aggregates; no per-customer
 * data beyond the URL (already public-on-purpose as the audit target).
 *
 *   npm run intelligence:cost
 *   npm run intelligence:cost -- --days=7
 *   npm run intelligence:cost -- --limit=10
 *   npm run intelligence:cost -- --days=14 --limit=5
 *
 * The script connects to whatever `DATABASE_URL` resolves to. Every
 * query is read-only; safe to run against production.
 *
 * See COST_AND_USAGE_TRACKING.md for the cost model, formula, and
 * reconciliation notes against the Anthropic Console.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const RAW_ARGS = process.argv.slice(2);

function readNumberFlag(name: string, fallback: number): number {
  const flag = RAW_ARGS.find((a) => a.startsWith(`--${name}=`));
  if (!flag) return fallback;
  const n = Number(flag.slice(`--${name}=`.length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const DAYS = readNumberFlag("days", 30);
const LIMIT = readNumberFlag("limit", 5);

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const cutoff = new Date(Date.now() - DAYS * 24 * 3600 * 1000);

  let agg;
  let retried;
  let failed;
  let top;
  let byModel;
  try {
    [agg, retried, failed, top, byModel] = await Promise.all([
      // Completed audits with cost data in the window.
      prisma.auditOrder.aggregate({
        where: {
          reportStatus: "generated",
          reportGeneratedAt: { gte: cutoff },
          estimatedCostUsd: { not: null },
        },
        _count: { _all: true },
        _avg: { estimatedCostUsd: true, workerRuntimeMs: true },
        _sum: {
          estimatedCostUsd: true,
          inputTokens: true,
          outputTokens: true,
        },
        _max: { estimatedCostUsd: true },
      }),
      // Retried audits (transient failure → re-queued and eventually
      // completed). Cost reflects the FINAL successful attempt only;
      // retry-attempt token spend is logged but not separately
      // persisted today.
      prisma.auditOrder.aggregate({
        where: {
          reportStatus: "generated",
          reportGeneratedAt: { gte: cutoff },
          retryCount: { gt: 0 },
          estimatedCostUsd: { not: null },
        },
        _count: { _all: true },
        _avg: { estimatedCostUsd: true },
        _sum: { estimatedCostUsd: true },
      }),
      // Failed audits in the window — token spend before failure is
      // not persisted (worker only writes usage on the success path),
      // so this section reports count + reason distribution only.
      prisma.auditOrder.groupBy({
        where: {
          reportStatus: "failed",
          updatedAt: { gte: cutoff },
        },
        by: ["failureReason"],
        _count: { _all: true },
      }),
      // Top spenders in the window.
      prisma.auditOrder.findMany({
        where: {
          reportStatus: "generated",
          reportGeneratedAt: { gte: cutoff },
          estimatedCostUsd: { not: null },
        },
        orderBy: { estimatedCostUsd: "desc" },
        take: LIMIT,
        select: {
          id: true,
          websiteUrl: true,
          modelUsed: true,
          inputTokens: true,
          outputTokens: true,
          workerRuntimeMs: true,
          estimatedCostUsd: true,
        },
      }),
      // Distribution by model — surfaces drift if a Haiku-routing
      // experiment lands or if the env's ANTHROPIC_MODEL changes.
      prisma.auditOrder.groupBy({
        where: {
          reportStatus: "generated",
          reportGeneratedAt: { gte: cutoff },
          modelUsed: { not: null },
          estimatedCostUsd: { not: null },
        },
        by: ["modelUsed"],
        _count: { _all: true },
        _avg: { estimatedCostUsd: true },
        _sum: { estimatedCostUsd: true },
      }),
    ]);
  } catch (err) {
    handlePrismaError(err);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\n[cost] ────── Audit Cost Summary ──────\n");
  console.log(
    `  Window:             last ${DAYS} day${DAYS === 1 ? "" : "s"} (since ${cutoff.toISOString().slice(0, 10)})`,
  );

  const completedCount = agg._count._all;
  if (completedCount === 0) {
    console.log(
      "\n  No cost data yet for this window. New audits run by the\n  Phase-1 worker integration will populate this table.\n",
    );
    await prisma.$disconnect();
    return;
  }

  const totalCost = asNumber(agg._sum.estimatedCostUsd);
  const avgCost = asNumber(agg._avg.estimatedCostUsd);
  const avgRuntime = asNumber(agg._avg.workerRuntimeMs);
  const totalInput = agg._sum.inputTokens ?? 0;
  const totalOutput = agg._sum.outputTokens ?? 0;
  console.log(
    `  Completed audits:   ${completedCount}      avg cost $${(avgCost ?? 0).toFixed(4)}   total $${(totalCost ?? 0).toFixed(4)}`,
  );
  console.log(
    `  Token spend:        input=${totalInput.toLocaleString()}   output=${totalOutput.toLocaleString()}`,
  );
  if (typeof avgRuntime === "number") {
    console.log(
      `  Avg runtime:        ${(avgRuntime / 1000).toFixed(1)}s`,
    );
  }

  // Retries
  if (retried._count._all > 0) {
    const retriedTotal = asNumber(retried._sum.estimatedCostUsd) ?? 0;
    const retriedAvg = asNumber(retried._avg.estimatedCostUsd) ?? 0;
    console.log(
      `\n  Retried audits:     ${retried._count._all}      avg cost $${retriedAvg.toFixed(4)}   total $${retriedTotal.toFixed(4)}`,
    );
    console.log(
      `                      (cost shown is the FINAL successful attempt; pre-retry token spend is logged only)`,
    );
  }

  // Failures
  if (failed.length > 0) {
    const totalFailed = failed.reduce((acc, r) => acc + r._count._all, 0);
    console.log(`\n  Failed audits:      ${totalFailed}`);
    console.log(
      `                      (token spend before failure is logged but not persisted on the row)`,
    );
    for (const row of failed.sort((a, b) => b._count._all - a._count._all)) {
      console.log(
        `    - ${pad(row.failureReason ?? "(no reason)", 22)} ${row._count._all}`,
      );
    }
  }

  // Top spenders
  if (top.length > 0) {
    console.log(`\n  Top ${top.length} highest-cost audits:`);
    top.forEach((row, i) => {
      const cost = asNumber(row.estimatedCostUsd) ?? 0;
      const host = hostnameOf(row.websiteUrl);
      const runtime =
        typeof row.workerRuntimeMs === "number"
          ? `${(row.workerRuntimeMs / 1000).toFixed(1)}s`
          : "—";
      console.log(
        `    ${i + 1}. ${row.id}  $${cost.toFixed(4)}  ${row.modelUsed ?? "(model?)"}  ${row.inputTokens ?? 0}/${row.outputTokens ?? 0}  ${runtime}  ${host}`,
      );
    });
  }

  // By model
  if (byModel.length > 0) {
    console.log(`\n  By model:`);
    for (const row of byModel.sort((a, b) => b._count._all - a._count._all)) {
      const total = asNumber(row._sum.estimatedCostUsd) ?? 0;
      const avg = asNumber(row._avg.estimatedCostUsd) ?? 0;
      console.log(
        `    - ${pad(row.modelUsed ?? "(unknown)", 24)} ${row._count._all} audits   avg $${avg.toFixed(4)}   total $${total.toFixed(4)}`,
      );
    }
  }

  console.log(
    "\n  Note: Anthropic-billed amount may differ — verify against the",
  );
  console.log(
    "        Console dashboard. See COST_AND_USAGE_TRACKING.md §1.5",
  );
  console.log("        for reconciliation notes.\n");

  await prisma.$disconnect();
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v as string | number);
  return Number.isFinite(n) ? n : null;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl.slice(0, 40);
  }
}

function handlePrismaError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : null;
  if (code === "P2021" || /does not exist|column .* does not exist/i.test(message)) {
    console.error(
      "\n[cost] AuditOrder cost columns not present yet. Apply the\n       migration first: `npx prisma migrate deploy`\n",
    );
    return;
  }
  console.error(`\n[cost] query failed: ${message}\n`);
}

main().catch((err) => {
  console.error("[cost] fatal error:", err);
  process.exit(1);
});
