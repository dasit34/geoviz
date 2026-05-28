/* eslint-disable no-console */
/**
 * scripts/benchmark-intelligence.ts
 *
 * Operator-grade synthesis CLI. Read-only. No LLM calls. No
 * mutations. Pulls from the 4 new helpers in
 * `src/lib/intelligence/benchmarks.ts` (Phase 2) and prints a
 * deterministic-template summary.
 *
 *   npx tsx scripts/benchmark-intelligence.ts
 *   npx tsx scripts/benchmark-intelligence.ts --industry roofing
 *   npx tsx scripts/benchmark-intelligence.ts --metric trustSignalScore
 *   npx tsx scripts/benchmark-intelligence.ts --since-days 30
 *   npx tsx scripts/benchmark-intelligence.ts --json
 *
 * Sister to scripts/benchmark-performers.ts (Phase H, unchanged).
 * That script outputs raw rankings; this one outputs synthesis.
 *
 * LANGUAGE RULE — deterministic evidence only. Every printed
 * sentence is a printf-style template over a helper return.
 * No LLM, no speculative phrasing.
 */
import "dotenv/config";

import {
  SCORE_FIELDS,
  getCategoryWeaknessFrequency,
  getMostUnstableCategory,
  getPercentileSummary,
  getScoreDistribution,
  type ScoreField,
} from "../src/lib/intelligence/benchmarks";
import { prisma } from "../src/lib/db";

function die(msg: string): never {
  console.error(`[benchmark-intelligence] error: ${msg}`);
  process.exit(2);
}

function printHelp(): void {
  console.log(
    [
      "Usage: npx tsx scripts/benchmark-intelligence.ts [options]",
      "",
      "Options:",
      `  --metric <field>     One of: ${SCORE_FIELDS.join(", ")} (default: overallScore)`,
      "  --industry <slug>    Filter percentile + distribution to one industry",
      "  --since-days <N>     Window for 'most unstable' (default 14)",
      "  --json               Emit machine-readable JSON",
      "",
      "Output sections:",
      "  1. Percentile summary (n, p25/p50/p75/p90, mean)",
      "  2. Score distribution across the 5 frozen bands",
      "  3. Category weakness frequency (cross-industry)",
      "  4. Most unstable category (from replay history)",
    ].join("\n"),
  );
}

type Args = {
  metric: ScoreField;
  industry?: string;
  sinceDays: number;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { metric: "overallScore", sinceDays: 14, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--metric": {
        const v = argv[++i] as ScoreField;
        if (!(SCORE_FIELDS as readonly string[]).includes(v)) {
          die(`--metric must be one of: ${SCORE_FIELDS.join(", ")}`);
        }
        out.metric = v;
        break;
      }
      case "--industry":
        out.industry = argv[++i];
        if (!out.industry) die("--industry requires a slug");
        break;
      case "--since-days": {
        const n = parseInt(argv[++i] ?? "", 10);
        if (!Number.isFinite(n) || n <= 0) die("--since-days requires a positive integer");
        out.sinceDays = n;
        break;
      }
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        die(`unknown argument: ${a}`);
    }
  }
  return out;
}

const CATEGORY_DISPLAY: Record<string, string> = {
  overallScore: "Overall",
  semanticClarityScore: "Semantic Clarity",
  crawlerAccessibilityScore: "Crawler Accessibility",
  trustSignalScore: "Trust Signals",
  structuredIdentityScore: "Structured Identity",
  recommendationReadinessScore: "Recommendation Readiness",
  // Used by getMostUnstableCategory which reads categoryDeltas with
  // scoring-engine category names (different vocabulary than ScoreField).
  schema: "Schema",
  crawler: "Crawlability",
  trust: "Trust Signals",
  content: "Content",
  brand: "Brand",
  tech: "Tech",
};

function fmtCategory(cat: string): string {
  return CATEGORY_DISPLAY[cat] ?? cat;
}

function fmtNum(n: number | null, digits = 2): string {
  return n === null ? "—" : n.toFixed(digits);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const [percentiles, distribution, weakness, unstable] = await Promise.all([
    getPercentileSummary({ industry: args.industry, metric: args.metric }),
    getScoreDistribution({ industry: args.industry }),
    getCategoryWeaknessFrequency(),
    getMostUnstableCategory({
      industry: args.industry,
      sinceDays: args.sinceDays,
    }),
  ]);

  if (args.json) {
    console.log(
      JSON.stringify({ percentiles, distribution, weakness, unstable }, null, 2),
    );
    await prisma.$disconnect();
    return;
  }

  console.log("[benchmark-intelligence]");
  console.log(
    `  metric:        ${args.metric}` +
      (args.industry ? `  ·  industry: ${args.industry}` : "") +
      `  ·  unstable window: ${args.sinceDays}d`,
  );
  console.log("");

  // ── 1. Percentile summary ─────────────────────────────────────
  console.log("  Percentile summary:");
  if (percentiles.count === 0) {
    console.log("    No data for this cohort.");
  } else {
    console.log(`    n = ${percentiles.count}`);
    console.log(`    p25 = ${fmtNum(percentiles.p25, 1)}`);
    console.log(`    p50 = ${fmtNum(percentiles.p50, 1)} (median)`);
    console.log(`    p75 = ${fmtNum(percentiles.p75, 1)}`);
    console.log(`    p90 = ${fmtNum(percentiles.p90, 1)}`);
    console.log(`    mean = ${fmtNum(percentiles.mean, 1)}`);
  }
  console.log("");

  // ── 2. Score distribution ─────────────────────────────────────
  console.log("  Score distribution (frozen bands):");
  const total = distribution.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    console.log("    No data for this cohort.");
  } else {
    for (const b of distribution) {
      const bar = "█".repeat(Math.max(0, Math.round(b.pct / 4)));
      console.log(
        `    ${b.band.padEnd(13)} ${String(b.count).padStart(4)}  (${String(b.pct).padStart(3)}%)  ${bar}`,
      );
    }
    console.log(`    total = ${total}`);
  }
  console.log("");

  // ── 3. Category weakness frequency ────────────────────────────
  console.log("  Category weakness frequency (cross-industry):");
  if (weakness.length === 0) {
    console.log("    No industries with multi-category data yet.");
  } else {
    for (const w of weakness) {
      console.log(
        `    ${fmtCategory(w.category).padEnd(28)} weakest in ${String(w.industriesAffected).padStart(2)} of ${w.totalIndustriesWithData} industries  (avg ${fmtNum(w.avgScoreAcrossAffected, 1)}/100)`,
      );
    }
  }
  console.log("");

  // ── 4. Most unstable category ─────────────────────────────────
  console.log(`  Most unstable category (last ${args.sinceDays} days):`);
  if (unstable === null) {
    console.log(
      `    Insufficient replay data (no category with ≥5 observations in window).`,
    );
  } else {
    console.log(
      `    ${fmtCategory(unstable.category)}  ·  σ=${fmtNum(unstable.stdevDelta)}  ·  mean|delta|=${fmtNum(unstable.meanAbsDelta)}  ·  n=${unstable.observationCount}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[benchmark-intelligence] unhandled error:", err);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
