/* eslint-disable no-console */
/**
 * scripts/benchmark-performers.ts
 *
 * Lists the top + bottom performing audits by a chosen score metric.
 * Read-only. No LLM calls. No mutations. Pure aggregation over
 * `AuditIntelligence`. Internal operator tooling — never exposed to
 * customers.
 *
 *   npx tsx scripts/benchmark-performers.ts
 *   npx tsx scripts/benchmark-performers.ts --metric trustSignalScore
 *   npx tsx scripts/benchmark-performers.ts --industry roofing --limit 5
 *
 * Mirrors the human-output idiom of scripts/intelligence-cost-summary.ts
 * (ordinal numbering + key metrics + hostname extraction).
 */
import "dotenv/config";

import {
  SCORE_FIELDS,
  getBottomPerformers,
  getTopPerformers,
  type PerformerRanking,
  type ScoreField,
} from "../src/lib/intelligence/benchmarks";
import { prisma } from "../src/lib/db";

function die(msg: string): never {
  console.error(`[benchmark-performers] error: ${msg}`);
  process.exit(2);
}

function printHelp(): void {
  console.log(
    [
      "Usage: npx tsx scripts/benchmark-performers.ts [options]",
      "",
      "Options:",
      `  --metric <field>     One of: ${SCORE_FIELDS.join(", ")} (default: overallScore)`,
      "  --industry <slug>    Filter to a single normalized industry slug",
      "  --limit <N>          Rows per side (default 10, max 50)",
      "",
      "Output: top N performers + bottom N performers + run metadata.",
    ].join("\n"),
  );
}

type Args = {
  metric: ScoreField;
  industry?: string;
  limit: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { metric: "overallScore", limit: 10 };
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
      case "--limit": {
        const n = parseInt(argv[++i] ?? "", 10);
        if (!Number.isFinite(n) || n <= 0) {
          die("--limit requires a positive integer");
        }
        out.limit = n;
        break;
      }
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

function hostnameOf(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function fmtRow(r: PerformerRanking, ordinal: number): string {
  const host = hostnameOf(r.websiteUrl);
  const name = r.businessName ?? "(unnamed)";
  const industry = r.industrySlug ?? "—";
  return `  ${String(ordinal).padStart(2, " ")}. ${String(r.score).padStart(3, " ")}  ${industry.padEnd(20)}  ${host.padEnd(36)}  ${name}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("[benchmark-performers]");
  console.log(
    `  metric:   ${args.metric}${args.industry ? `  ·  industry: ${args.industry}` : ""}  ·  limit: ${args.limit}`,
  );
  console.log("");

  const [top, bottom] = await Promise.all([
    getTopPerformers({
      metric: args.metric,
      industry: args.industry,
      limit: args.limit,
    }),
    getBottomPerformers({
      metric: args.metric,
      industry: args.industry,
      limit: args.limit,
    }),
  ]);

  if (top.length === 0 && bottom.length === 0) {
    console.log("  No audits matched the cohort.");
    await prisma.$disconnect();
    return;
  }

  console.log(`  Top ${top.length} performers:`);
  top.forEach((r, i) => console.log(fmtRow(r, i + 1)));
  console.log("");
  console.log(`  Bottom ${bottom.length} performers:`);
  bottom.forEach((r, i) => console.log(fmtRow(r, i + 1)));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[benchmark-performers] unhandled error:", err);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
