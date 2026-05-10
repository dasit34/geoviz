/* eslint-disable no-console */
/**
 * Recovers AuditOrder rows stuck in `reportStatus = "running"` and
 * resets them to `reportStatus = "queued"` so the next worker poll
 * picks them up.
 *
 * Two modes:
 *   • Default — age-based. Recovers only rows whose `reportStartedAt`
 *     is older than `GEO_WORKER_TIMEOUT_MS + 2 min` (default total ≈
 *     7 min). Safe to run while the worker is processing other jobs;
 *     active runs are not interrupted.
 *
 *   • `--force` — recovers EVERY row currently in "running" state
 *     regardless of age. Use this when a row is stuck "running" and
 *     you're certain no worker is actively on it (e.g. the worker
 *     was killed mid-job, or a Railway redeploy aborted the process).
 *
 * Optional `--filter=<substring>` narrows the match to rows whose
 * `websiteUrl` or `businessName` contains the given substring
 * (case-insensitive). Useful for repairing a single sample audit
 * without touching others.
 *
 * Examples:
 *   npx tsx scripts/recover-stale-jobs.ts
 *   npx tsx scripts/recover-stale-jobs.ts --force
 *   npx tsx scripts/recover-stale-jobs.ts --force --filter=ohioroofingandsiding
 *
 * Always prints a preview of the rows it intends to recover before
 * mutating the DB. Idempotent — safe to re-run.
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";

const TIMEOUT_MS = Number(process.env.GEO_WORKER_TIMEOUT_MS ?? 300_000);
const STALE_AFTER_MS = TIMEOUT_MS + 2 * 60_000;

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filterArg = args.find((a) => a.startsWith("--filter="));
  const filter = filterArg ? filterArg.slice("--filter=".length) : null;
  return { force, filter };
}

async function main(): Promise<void> {
  const { force, filter } = parseArgs();
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log(
      `[recover-stale-jobs] mode=${force ? "force (any age)" : `age-based (older than ${Math.round(STALE_AFTER_MS / 60_000)} min)`}${filter ? ` filter="${filter}"` : ""}`,
    );

    const where: Prisma.AuditOrderWhereInput = {
      reportStatus: "running",
    };

    if (!force) {
      const cutoff = new Date(Date.now() - STALE_AFTER_MS);
      where.OR = [
        { reportStartedAt: { lt: cutoff } },
        { reportStartedAt: null },
      ];
    }

    if (filter) {
      const filterClauses: Prisma.AuditOrderWhereInput[] = [
        { websiteUrl: { contains: filter, mode: "insensitive" } },
        { businessName: { contains: filter, mode: "insensitive" } },
      ];
      // Compose with the existing OR (age clauses) by AND-ing — every
      // matched row must (a) be running, (b) match the age clause if
      // not --force, (c) match the filter substring.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: filterClauses }];
        delete where.OR;
      } else {
        where.OR = filterClauses;
      }
    }

    const stale = await prisma.auditOrder.findMany({
      where,
      select: {
        id: true,
        websiteUrl: true,
        businessName: true,
        reportStartedAt: true,
        reportQueuedAt: true,
      },
    });

    if (stale.length === 0) {
      console.log("[recover-stale-jobs] nothing to recover. exiting.");
      return;
    }

    console.log(
      `[recover-stale-jobs] found ${stale.length} row(s) to reset → "queued":`,
    );
    for (const row of stale) {
      const startedAt = row.reportStartedAt
        ? row.reportStartedAt.toISOString()
        : "(null)";
      const ageMin = row.reportStartedAt
        ? Math.round(
            (Date.now() - row.reportStartedAt.getTime()) / 60_000,
          )
        : null;
      console.log(
        `  - ${row.id} · ${row.businessName ?? "(no name)"} · ${row.websiteUrl} · startedAt=${startedAt}${ageMin !== null ? ` (${ageMin} min ago)` : ""}`,
      );
    }

    const recoveredAt = new Date();
    const result = await prisma.auditOrder.updateMany({
      where,
      data: {
        reportStatus: "queued",
        reportQueuedAt: recoveredAt,
        reportError: `Recovered from "running" state at ${recoveredAt.toISOString()} via scripts/recover-stale-jobs.ts${force ? " (--force)" : ""}.`,
      },
    });

    console.log(
      `[recover-stale-jobs] recovered ${result.count} row(s) → reportStatus="queued"`,
    );
    console.log("[recover-stale-jobs] start the worker to pick them up:");
    console.log("    GEO_AUDIT_MODE=api npm run geo-worker:start");
  } finally {
    await prisma.$disconnect().catch(() => {
      /* ignore */
    });
  }
}

main().catch((err) => {
  console.error("[recover-stale-jobs] FAILED:", err);
  process.exit(1);
});
