/* eslint-disable no-console */
/**
 * scripts/score-premigration-check.ts
 *
 * Read-only baseline pulled BEFORE applying the
 * `20260523000000_add_deterministic_score` migration. Prints:
 *
 *   • AuditIntelligence row counts
 *   • preflight-bearing row count (backfill eligible)
 *   • scoringVersion distribution (current mix)
 *   • Sanity check: any rows with reportStatus="generated" but null markdown
 *   • Backup + rollback commands the operator can copy-paste
 *
 * Production-safe — every query is read-only.
 *
 *   npm run score:premigration-check
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const startedAt = Date.now();

  console.log("[premigration-check] starting (read-only)");

  // 1. Total AuditIntelligence rows
  const total = await prisma.auditIntelligence.count();

  // 2. Preflight-bearing rows — backfill eligible
  const withPreflight = await prisma.auditIntelligence.count({
    where: {
      NOT: { preflightSignals: { equals: Prisma.JsonNull } },
    },
  });

  // 3. scoringVersion distribution
  const versions = await prisma.auditIntelligence.groupBy({
    by: ["scoringVersion"],
    _count: { _all: true },
    orderBy: { _count: { scoringVersion: "desc" } },
  });

  // 4. Sanity: generated rows with null markdown (should be 0)
  const generatedButNoMarkdown = await prisma.auditIntelligence.count({
    where: {
      auditOrder: {
        reportStatus: "generated",
        reportMarkdown: null,
      },
    },
  });

  // 5. Recent preflight-bearing sample (last 5) — eyeball
  const recentSample = await prisma.auditIntelligence.findMany({
    where: {
      NOT: { preflightSignals: { equals: Prisma.JsonNull } },
    },
    select: {
      auditOrderId: true,
      createdAt: true,
      scoringVersion: true,
      websiteUrl: true,
      overallScore: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  await prisma.$disconnect();

  console.log("");
  console.log("[baseline]");
  console.log(`  AuditIntelligence rows:           ${total}`);
  console.log(
    `  preflight-bearing (eligible):     ${withPreflight} (${total > 0 ? Math.round((withPreflight / total) * 100) : 0}%)`,
  );
  console.log(
    `  rows without preflight (skip):    ${total - withPreflight}`,
  );
  console.log("");
  console.log("[scoringVersion distribution]");
  for (const v of versions) {
    console.log(
      `  ${(v.scoringVersion ?? "(null)").padEnd(28)} × ${v._count._all}`,
    );
  }
  console.log("");
  console.log("[sanity]");
  console.log(
    `  generated rows with null markdown: ${generatedButNoMarkdown}  (expect 0)`,
  );
  console.log("");
  console.log("[recent preflight-bearing sample]");
  for (const r of recentSample) {
    console.log(
      `  ${r.auditOrderId}  ${r.createdAt.toISOString()}  v=${r.scoringVersion}  overall=${r.overallScore ?? "-"}  url=${r.websiteUrl}`,
    );
  }

  console.log("");
  console.log("─── BACKUP (run before applying the migration) ──────────");
  console.log("");
  console.log(
    "pg_dump $DATABASE_URL --schema=public --table='AuditIntelligence' \\",
  );
  console.log(
    "  --file=AuditIntelligence_pre_scoring1_0_0_$(date +%Y%m%d_%H%M%S).sql",
  );
  console.log("");
  console.log("─── APPLY ────────────────────────────────────────────────");
  console.log("");
  console.log("npx prisma migrate deploy");
  console.log("");
  console.log("─── ROLLBACK (if needed, after apply) ────────────────────");
  console.log("");
  console.log(
    'psql $DATABASE_URL -c \'ALTER TABLE "AuditIntelligence" DROP COLUMN "deterministicScore";\'',
  );
  console.log(
    "psql $DATABASE_URL -c \"DELETE FROM \\\"_prisma_migrations\\\" WHERE migration_name = '20260523000000_add_deterministic_score';\"",
  );
  console.log("");
  console.log(
    "─── ESTIMATED RUNTIME ────────────────────────────────────────",
  );
  console.log("");
  console.log(
    "  Migration: <100ms (pure ADD COLUMN nullable, no table rewrite).",
  );
  console.log(
    `  Backfill:  ~${withPreflight * 50}ms total wall time (50ms/row, batch=25, pause=2s),`,
  );
  console.log(
    `             approximately ${Math.ceil((withPreflight / 25) * 2 + (withPreflight * 0.05))} seconds end-to-end.`,
  );
  console.log("");
  console.log(
    `[premigration-check] done in ${Date.now() - startedAt}ms`,
  );
}

main().catch((err) => {
  console.error("[premigration-check] error:", err);
  process.exitCode = 1;
});
