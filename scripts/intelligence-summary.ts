/* eslint-disable no-console */
/**
 * scripts/intelligence-summary.ts
 *
 * Internal read-only inspection — prints a one-screen summary of
 * everything currently in the `AuditIntelligence` table. Pure
 * aggregate output; no per-customer data, no markdown, no emails.
 *
 *   npm run intelligence:summary
 *
 * The script connects to whatever `DATABASE_URL` your `.env`
 * resolves to. Production-safe — every query is read-only.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getBenchmarkSummary } from "../src/lib/intelligence/benchmarks";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  let summary;
  try {
    summary = await getBenchmarkSummary();
  } catch (err) {
    handlePrismaError(err);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\n[intelligence] ────── Benchmark Summary ──────\n");
  console.log(`  Total intelligence rows:    ${summary.totalRows}`);

  if (summary.totalRows === 0) {
    console.log(
      "\n  No intelligence rows yet. Once the worker writes new audits\n  (or you run `npm run backfill:audit-intelligence`) this summary\n  will populate.\n",
    );
    await prisma.$disconnect();
    return;
  }

  console.log(
    `  Avg overall score:          ${formatStat(summary.averageOverallScore)}`,
  );
  console.log(
    `  Overall score range:        ${formatRange(summary.overallScoreRange)}`,
  );

  if (summary.industryDistribution.length > 0) {
    console.log("\n  Industry distribution:");
    for (const row of summary.industryDistribution) {
      console.log(`    - ${pad(row.slug, 24)} ${row.count}`);
    }
  }

  if (summary.confidenceDistribution.length > 0) {
    console.log("\n  Confidence distribution:");
    for (const row of summary.confidenceDistribution) {
      console.log(`    - ${pad(row.level, 8)} ${row.count}`);
    }
  }

  if (summary.auditEngineVersions.length > 0) {
    console.log("\n  Audit engine versions:");
    for (const row of summary.auditEngineVersions) {
      console.log(`    - ${pad(row.version, 12)} ${row.count}`);
    }
  }

  if (summary.scoringVersions.length > 0) {
    console.log("\n  Scoring versions:");
    for (const row of summary.scoringVersions) {
      console.log(`    - ${pad(row.version, 20)} ${row.count}`);
    }
  }

  // Operator-supplied benchmark tag cohorts. Only shown when at
  // least one row carries a tag — keeps the summary terse for
  // installations that don't use cohort tagging.
  if (summary.benchmarkTagDistribution.length > 0) {
    console.log("\n  Operator benchmark tags:");
    for (const row of summary.benchmarkTagDistribution) {
      console.log(`    - ${pad(row.tag, 28)} ${row.count}`);
    }
  }

  console.log("");
  await prisma.$disconnect();
}

function formatStat(s: { value: number | null; count: number }): string {
  if (s.value === null) return `(none — n=${s.count})`;
  return `${s.value.toFixed(1)}  (n=${s.count})`;
}

function formatRange(r: {
  min: number | null;
  max: number | null;
  count: number;
}): string {
  if (r.min === null || r.max === null) return `(none — n=${r.count})`;
  return `${r.min} – ${r.max}  (n=${r.count})`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function handlePrismaError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : null;
  if (code === "P2021" || /does not exist/i.test(message)) {
    console.error(
      "\n[intelligence] AuditIntelligence table not found. Apply the\n               migrations first: `npx prisma migrate deploy`\n",
    );
    return;
  }
  console.error(`\n[intelligence] query failed: ${message}\n`);
}

main().catch((err) => {
  console.error("[intelligence] fatal error:", err);
  process.exit(1);
});
