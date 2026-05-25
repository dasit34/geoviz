/* eslint-disable no-console */
/**
 * scripts/score-validate.ts
 *
 * Post-backfill validation: pick 5 oldest + 5 most recent audits that
 * carry both a legacy markdown-based score AND a deterministic score.
 * Compare them, print as a table, flag deltas > 15, and produce a
 * recalibration recommendation.
 *
 * Read-only — never writes.
 *
 *   npm run score:validate
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

import { bandFor } from "../src/lib/scoring/bands";
import {
  bandLabelForOverall,
  parseReportScoreBreakdown,
} from "../src/lib/parse-report";

const FLAG_THRESHOLD = 15;

type Row = {
  auditOrderId: string;
  websiteUrl: string;
  createdAt: Date;
  scoringVersion: string;
  reportMarkdown: string | null;
  deterministicScore: unknown;
};

type DeterministicLike = {
  overall_score: number;
  band: string;
  confidence_level: string;
};

type Comparison = {
  orderId: string;
  url: string;
  createdAt: Date;
  legacy: number | null;
  deterministic: number | null;
  delta: number | null;
  legacyBand: string;
  detBand: string;
  confidence: string;
  flagged: boolean;
};

async function fetchPair(
  prisma: PrismaClient,
  bucket: "oldest" | "recent",
): Promise<Row[]> {
  const order = bucket === "oldest" ? "asc" : "desc";
  // Pull rows that have BOTH markdown (so we can compute legacy_score)
  // AND deterministicScore (so we can read the post-backfill value).
  const rows = await prisma.auditIntelligence.findMany({
    where: {
      scoringVersion: "scoring@1.0.0",
      NOT: { deterministicScore: { equals: Prisma.JsonNull } },
      auditOrder: { reportMarkdown: { not: null } },
    },
    orderBy: { createdAt: order },
    take: 5,
    select: {
      auditOrderId: true,
      websiteUrl: true,
      createdAt: true,
      scoringVersion: true,
      deterministicScore: true,
      auditOrder: { select: { reportMarkdown: true } },
    },
  });
  return rows.map((r) => ({
    auditOrderId: r.auditOrderId,
    websiteUrl: r.websiteUrl,
    createdAt: r.createdAt,
    scoringVersion: r.scoringVersion,
    reportMarkdown: r.auditOrder.reportMarkdown,
    deterministicScore: r.deterministicScore,
  }));
}

function isDeterministic(v: unknown): v is DeterministicLike {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.overall_score === "number" &&
    typeof obj.band === "string" &&
    typeof obj.confidence_level === "string"
  );
}

function compare(row: Row): Comparison {
  const det = isDeterministic(row.deterministicScore)
    ? row.deterministicScore
    : null;
  const detScore = det?.overall_score ?? null;
  const legacy = parseReportScoreBreakdown(row.reportMarkdown ?? null);
  const legacyScore =
    typeof legacy.overall === "number" ? legacy.overall : null;
  const delta =
    detScore !== null && legacyScore !== null ? detScore - legacyScore : null;
  return {
    orderId: row.auditOrderId,
    url: row.websiteUrl,
    createdAt: row.createdAt,
    legacy: legacyScore,
    deterministic: detScore,
    delta,
    legacyBand: legacyScore !== null ? bandLabelForOverall(legacyScore) : "—",
    detBand: detScore !== null ? bandFor(detScore) : "—",
    confidence: det?.confidence_level ?? "—",
    flagged: delta !== null && Math.abs(delta) > FLAG_THRESHOLD,
  };
}

function pad(s: string | number, n: number): string {
  const str = String(s);
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

function fmtUrl(u: string, n = 40): string {
  return u.length <= n ? pad(u, n) : pad(u.slice(0, n - 1) + "…", n);
}

function recommendation(
  flagged: number,
  largestAbsDelta: number,
  bandMigrations: number,
): string {
  if (largestAbsDelta <= 5 && bandMigrations === 0) {
    return "No recalibration needed. Deterministic engine aligns tightly with legacy parser.";
  }
  if (largestAbsDelta <= 15 && bandMigrations <= 2) {
    return "Minor drift. Acceptable distribution; monitor next 50 audits for trend.";
  }
  if (flagged > 3 || bandMigrations > 3) {
    return "Systematic drift. Recommend recalibrating cap / penalty thresholds (src/lib/scoring/caps.ts) and / or category ladder anchors. Do NOT modify weights — frozen per CLAUDE.md.";
  }
  return "Localized drift on a few outliers. Inspect the flagged rows for evidence anomalies before retuning.";
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const startedAt = Date.now();
  console.log(`[validate] starting (read-only)`);

  const oldest = await fetchPair(prisma, "oldest");
  const recent = await fetchPair(prisma, "recent");

  await prisma.$disconnect();

  const oldestComp = oldest.map(compare);
  const recentComp = recent.map(compare);
  const all = [...oldestComp, ...recentComp];

  if (all.length === 0) {
    console.log(
      "[validate] no rows with both reportMarkdown AND deterministicScore — skipping comparison",
    );
    console.log(
      "[validate] this is expected if the backfill hasn't run yet or no audits have shipped on scoring@1.0.0",
    );
    return;
  }

  const printRow = (c: Comparison) => {
    const legacy = c.legacy !== null ? pad(c.legacy, 5) : pad("n/a", 5);
    const det = c.deterministic !== null ? pad(c.deterministic, 5) : pad("n/a", 5);
    const delta =
      c.delta !== null
        ? pad(`${c.delta >= 0 ? "+" : ""}${c.delta}`, 6)
        : pad("n/a", 6);
    const flag = c.flagged ? "  ⚠ FLAG" : "";
    console.log(
      `  ${pad(c.orderId, 26)} ${fmtUrl(c.url)} legacy=${legacy} det=${det} Δ=${delta} conf=${pad(c.confidence, 9)}${flag}`,
    );
  };

  console.log("");
  console.log("[oldest 5 — pre-backfill cohort]");
  oldestComp.forEach(printRow);
  console.log("");
  console.log("[most-recent 5 — post-deterministic cohort]");
  recentComp.forEach(printRow);

  // Aggregates
  const withDelta = all.filter(
    (c): c is Comparison & { delta: number } => c.delta !== null,
  );
  const avgAbsDelta =
    withDelta.length > 0
      ? withDelta.reduce((s, c) => s + Math.abs(c.delta), 0) /
        withDelta.length
      : 0;
  const largestAbs =
    withDelta.length > 0
      ? withDelta.reduce((m, c) => Math.max(m, Math.abs(c.delta)), 0)
      : 0;
  const flagged = withDelta.filter((c) => c.flagged).length;
  const bandMigrations = withDelta.filter(
    (c) => c.legacyBand !== c.detBand,
  ).length;

  console.log("");
  console.log("[aggregates over 10 rows]");
  console.log(`  avg |delta|:        ${avgAbsDelta.toFixed(2)}`);
  console.log(`  largest |delta|:    ${largestAbs}`);
  console.log(`  rows flagged (>15): ${flagged} of ${withDelta.length}`);
  console.log(
    `  band migrations:    ${bandMigrations} of ${withDelta.length}`,
  );

  console.log("");
  console.log("[recommended recalibration]");
  console.log(`  ${recommendation(flagged, largestAbs, bandMigrations)}`);

  console.log("");
  console.log(`[validate] done in ${Date.now() - startedAt}ms`);
}

main().catch((err) => {
  console.error("[validate] error:", err);
  process.exitCode = 1;
});
