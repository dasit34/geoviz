/* eslint-disable no-console */
/**
 * scripts/intelligence-industry.ts
 *
 * Internal read-only inspection — prints the benchmark + weakest-
 * categories ranking for a single industry slug.
 *
 *   npm run intelligence:industry -- roofing
 *   npm run intelligence:industry -- hvac
 *   npm run intelligence:industry -- dental
 *
 * Valid slugs are the V1 industry taxonomy (see
 * `src/lib/intelligence/industry-taxonomy.ts`). Unknown slugs return
 * an empty benchmark — no error, just zero counts.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  getIndustryBenchmark,
  getWeakestCategoriesByIndustry,
  type ScoreField,
} from "../src/lib/intelligence/benchmarks";

const SCORE_LABELS: Record<ScoreField, string> = {
  overallScore: "Overall",
  semanticClarityScore: "Semantic clarity",
  crawlerAccessibilityScore: "Crawler accessibility",
  trustSignalScore: "Trust signals",
  structuredIdentityScore: "Structured identity",
  recommendationReadinessScore: "Recommendation readiness",
};

async function main(): Promise<void> {
  const slug = (process.argv[2] ?? "").trim();
  if (!slug) {
    console.error(
      "[intelligence] usage: npm run intelligence:industry -- <slug>",
    );
    console.error(
      "[intelligence] example slugs: roofing, hvac, plumbing, dental, salon, legal, …",
    );
    process.exit(2);
  }

  const prisma = new PrismaClient();
  let bench;
  let weakest;
  try {
    bench = await getIndustryBenchmark(slug);
    weakest = await getWeakestCategoriesByIndustry(slug);
  } catch (err) {
    handlePrismaError(err);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`\n[intelligence] ────── Industry: ${bench.industrySlug} ──────\n`);
  console.log(`  Audit count:                ${bench.auditCount}`);

  if (bench.auditCount === 0) {
    console.log(
      `\n  No intelligence rows found for industry="${bench.industrySlug}".\n  Either the slug is misspelled or no audits in this cohort have\n  been written yet.\n`,
    );
    await prisma.$disconnect();
    return;
  }

  console.log("\n  Average scores (n = non-null sample size):");
  for (const field of [
    "overallScore",
    "semanticClarityScore",
    "crawlerAccessibilityScore",
    "trustSignalScore",
    "structuredIdentityScore",
    "recommendationReadinessScore",
  ] as ScoreField[]) {
    const stat = bench.averages[field];
    const label = SCORE_LABELS[field];
    console.log(`    - ${pad(label, 28)} ${formatStat(stat)}`);
  }

  if (weakest.length > 0) {
    console.log("\n  Weakest categories (lowest avg first):");
    for (const w of weakest) {
      console.log(
        `    - ${pad(SCORE_LABELS[w.category], 28)} ${w.averageScore.toFixed(1)}  (n=${w.sampleCount})`,
      );
    }
  }

  if (bench.confidenceDistribution.length > 0) {
    console.log("\n  Confidence distribution:");
    for (const row of bench.confidenceDistribution) {
      console.log(`    - ${pad(row.level, 8)} ${row.count}`);
    }
  }

  if (bench.scoringVersions.length > 0) {
    console.log("\n  Scoring versions in this cohort:");
    for (const row of bench.scoringVersions) {
      console.log(`    - ${pad(row.version, 20)} ${row.count}`);
    }
  }

  if (bench.taxonomyVersions.length > 0) {
    console.log("\n  Taxonomy versions in this cohort:");
    for (const row of bench.taxonomyVersions) {
      console.log(`    - ${pad(row.version, 8)} ${row.count}`);
    }
  }

  console.log("");
  await prisma.$disconnect();
}

function formatStat(s: { value: number | null; count: number }): string {
  if (s.value === null) return `(none — n=${s.count})`;
  return `${s.value.toFixed(1)}  (n=${s.count})`;
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
