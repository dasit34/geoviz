/* eslint-disable no-console */
/**
 * scripts/scoring-calibration-report.ts
 *
 * Read-only aggregate summary of every `AuditIntelligence` row that
 * carries a deterministic score (`scoring@1.0.0`+). Prints score
 * distribution, average confidence, bucket frequency, category
 * contribution, most common caps + penalties, weakest/strongest
 * category frequency, and synergy frequency.
 *
 *   npm run scoring:calibration
 *
 * Production-safe — only SELECT queries.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { scoreCalibrationSummary } from "../src/lib/scoring/calibration-summary";
import type {
  CategoryKey,
  DeterministicScore,
  PublicBucketKey,
} from "../src/lib/scoring/types";

const JSON_MODE = process.argv.includes("--json");

const BAR_WIDTH = 20;

type Row = {
  createdAt: Date;
  websiteUrl: string;
  industryCategoryNormalized: string | null;
  deterministicScore: unknown;
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  // --json mode: emit the programmatic summary and exit. Used by
  // dashboards, alerts, and any non-human consumer.
  if (JSON_MODE) {
    const summary = await scoreCalibrationSummary({ prisma });
    await prisma.$disconnect();
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const rows = (await prisma.auditIntelligence.findMany({
    where: {
      // Filter at SQL: any row where the JSON column is non-null.
      // Prisma's `not: { equals: Prisma.JsonNull }` resolves to that.
      // We can't use AndJsonNullValueFilter universally so do a
      // simple non-null check in JS after the query.
    },
    select: {
      createdAt: true,
      websiteUrl: true,
      industryCategoryNormalized: true,
      deterministicScore: true,
    },
    orderBy: { createdAt: "desc" },
  })) as Row[];

  await prisma.$disconnect();

  const scored = rows
    .map((r) => {
      const d = r.deterministicScore as DeterministicScore | null;
      if (!d || typeof d !== "object") return null;
      if (typeof d.overall_score !== "number") return null;
      return { ...r, score: d };
    })
    .filter((r): r is Row & { score: DeterministicScore } => r !== null);

  if (scored.length === 0) {
    console.log("[scoring-calibration] no deterministic-scored audits yet");
    return;
  }

  const start = scored[scored.length - 1].createdAt.toISOString().slice(0, 10);
  const end = scored[0].createdAt.toISOString().slice(0, 10);
  console.log(
    `[scoring-calibration] scoring@1.0.0 · ${scored.length} audits · ${start} → ${end}\n`,
  );

  /* ─── Score distribution ─── */
  const bands = {
    Invisible: 0,
    "At Risk": 0,
    "Needs Work": 0,
    Competitive: 0,
    "AI-Ready": 0,
  } as Record<string, number>;
  let sum = 0;
  for (const r of scored) {
    bands[r.score.band] = (bands[r.score.band] ?? 0) + 1;
    sum += r.score.overall_score;
  }
  const avgOverall = sum / scored.length;

  console.log("Score distribution");
  const bandOrder: Array<[string, string]> = [
    ["Invisible", "[0-25]"],
    ["At Risk", "[26-45]"],
    ["Needs Work", "[46-65]"],
    ["Competitive", "[66-80]"],
    ["AI-Ready", "[81-100]"],
  ];
  for (const [name, range] of bandOrder) {
    const count = bands[name] ?? 0;
    const pct = (count / scored.length) * 100;
    const filled = Math.round((pct / 100) * BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    console.log(
      `  ${pad(name, 12)} ${pad(range, 8)} ${bar}  ${pad(String(count), 4)} (${pct.toFixed(0)}%)`,
    );
  }

  /* ─── Confidence ─── */
  const conf = { high: 0, moderate: 0, low: 0 };
  let confScoreSum = 0;
  for (const r of scored) {
    conf[r.score.confidence_level] = (conf[r.score.confidence_level] ?? 0) + 1;
    confScoreSum += r.score.confidence_score;
  }
  console.log("\nConfidence");
  console.log(
    `  high       ${pctStr(conf.high, scored.length)}   moderate   ${pctStr(conf.moderate, scored.length)}   low   ${pctStr(conf.low, scored.length)}`,
  );
  console.log(`  avg confidence score  ${(confScoreSum / scored.length).toFixed(1)}`);
  console.log(`  avg overall score     ${avgOverall.toFixed(1)}`);

  /* ─── Public buckets ─── */
  const bucketKeys: PublicBucketKey[] = [
    "understanding",
    "retrieval",
    "trust",
    "recommendation",
  ];
  const bucketAvg: Record<string, number> = {};
  for (const k of bucketKeys) {
    let s = 0;
    for (const r of scored) s += r.score.public_bucket_scores[k].percentage;
    bucketAvg[k] = s / scored.length;
  }
  console.log("\nPublic buckets — average percentage");
  console.log(
    `  Understanding   ${bucketAvg.understanding.toFixed(0)}%        Retrieval      ${bucketAvg.retrieval.toFixed(0)}%`,
  );
  console.log(
    `  Trust           ${bucketAvg.trust.toFixed(0)}%        Recommendation ${bucketAvg.recommendation.toFixed(0)}%`,
  );

  /* ─── Category contribution ─── */
  const catKeys: CategoryKey[] = [
    "schema",
    "crawler",
    "trust",
    "content",
    "brand",
    "tech",
  ];
  const catSum: Record<string, { score: number; max: number }> = {};
  for (const k of catKeys) catSum[k] = { score: 0, max: 0 };
  for (const r of scored) {
    for (const k of catKeys) {
      catSum[k].score += r.score.category_scores[k].score;
      catSum[k].max += r.score.category_scores[k].max;
    }
  }
  console.log("\nCategory contribution (avg points / max)");
  const fmt = (k: CategoryKey) =>
    `${pad(cap(k), 7)}  ${(catSum[k].score / scored.length).toFixed(1)}/${(catSum[k].max / scored.length).toFixed(0)}`;
  console.log(`  ${fmt("schema")}   ${fmt("crawler")}   ${fmt("trust")}`);
  console.log(`  ${fmt("content")}  ${fmt("brand")}     ${fmt("tech")}`);

  /* ─── Caps and penalties ─── */
  const capCount: Record<string, number> = {};
  const penCount: Record<string, number> = {};
  for (const r of scored) {
    for (const c of r.score.applied_caps) capCount[c.rule_id] = (capCount[c.rule_id] ?? 0) + 1;
    for (const p of r.score.applied_penalties) penCount[p.rule_id] = (penCount[p.rule_id] ?? 0) + 1;
  }
  const capRanked = Object.entries(capCount).sort((a, b) => b[1] - a[1]);
  const penRanked = Object.entries(penCount).sort((a, b) => b[1] - a[1]);
  console.log("\nMost common caps                   Most common penalties");
  const rows1 = Math.max(capRanked.length, penRanked.length);
  for (let i = 0; i < Math.min(5, rows1); i++) {
    const c = capRanked[i] ? `${pad(capRanked[i][0], 32)} ${pad(String(capRanked[i][1]), 4)}` : pad("", 37);
    const p = penRanked[i] ? `${pad(penRanked[i][0], 24)} ${pad(String(penRanked[i][1]), 4)}` : "";
    console.log(`  ${c}   ${p}`);
  }
  if (rows1 === 0) console.log("  (none recorded)");

  /* ─── Weakest + strongest category frequency ─── */
  const weakest: Record<string, number> = {};
  const strongest: Record<string, number> = {};
  for (const r of scored) {
    let weakKey: CategoryKey = "schema";
    let weakRatio = 1.1;
    let strongKey: CategoryKey = "schema";
    let strongRatio = -0.1;
    for (const k of catKeys) {
      const c = r.score.category_scores[k];
      const ratio = c.max > 0 ? c.score / c.max : 0;
      if (ratio < weakRatio) { weakRatio = ratio; weakKey = k; }
      if (ratio > strongRatio) { strongRatio = ratio; strongKey = k; }
    }
    weakest[weakKey] = (weakest[weakKey] ?? 0) + 1;
    strongest[strongKey] = (strongest[strongKey] ?? 0) + 1;
  }
  const weakRanked = Object.entries(weakest).sort((a, b) => b[1] - a[1]);
  const strongRanked = Object.entries(strongest).sort((a, b) => b[1] - a[1]);
  console.log("\nWeakest category frequency         Strongest category frequency");
  const rows2 = Math.max(weakRanked.length, strongRanked.length);
  for (let i = 0; i < Math.min(6, rows2); i++) {
    const w = weakRanked[i]
      ? `${pad(cap(weakRanked[i][0]), 10)} ${pctStr(weakRanked[i][1], scored.length)}`
      : "";
    const sCol = strongRanked[i]
      ? `${pad(cap(strongRanked[i][0]), 10)} ${pctStr(strongRanked[i][1], scored.length)}`
      : "";
    console.log(`  ${pad(w, 32)}   ${sCol}`);
  }

  /* ─── Synergy frequency ─── */
  const syn = scored.filter((r) => r.score.synergy_bonus_applied > 0).length;
  console.log(
    `\nSynergy bonus fired on ${syn} audits (${pctStr(syn, scored.length)})`,
  );

  /* ─── Average score by industry (if any) ─── */
  const industryRows = scored.filter((r) => r.industryCategoryNormalized);
  if (industryRows.length > 0) {
    const byIndustry: Record<string, { sum: number; count: number }> = {};
    for (const r of industryRows) {
      const key = r.industryCategoryNormalized!;
      const slot = byIndustry[key] ?? { sum: 0, count: 0 };
      slot.sum += r.score.overall_score;
      slot.count += 1;
      byIndustry[key] = slot;
    }
    console.log("\nAverage score by industry");
    const ranked = Object.entries(byIndustry).sort(
      (a, b) => b[1].count - a[1].count,
    );
    for (const [name, { sum: s, count }] of ranked.slice(0, 10)) {
      console.log(
        `  ${pad(name, 30)} ${pad(String(count), 4)} audits   avg ${(s / count).toFixed(1)}`,
      );
    }
  }
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pctStr(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((n / total) * 100).toFixed(0)}%`;
}

main().catch((err) => {
  console.error("[scoring-calibration] error:", err);
  process.exitCode = 1;
});
