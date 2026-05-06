/**
 * Calibration recalibration projector — Iteration #2.
 *
 * Projects existing calibration runs onto the v2 ladder rubric so we
 * can see what the spread *would* look like under the new scoring
 * before committing the dataset to a real re-run.
 *
 * Three modes:
 *   1. Default (no flags) — load every [CAL] AuditOrder row from the
 *      DB, project each old → new, print aggregate + bands + top
 *      movers + DISTRIBUTION HEALTH verdict.
 *   2. `--archetypes` — skip the DB and project the 7 user-supplied
 *      archetypes (2 weak, 2 average, 2 strong, 1 elite) inline.
 *      Useful to verify rubric math before any real-world run.
 *   3. `--rerun` — flip every [CAL] row back to reportStatus="queued"
 *      so the worker re-audits them under the new rubric.
 *
 * Untouched: Stripe, queue worker code, report rendering, PDF,
 * calibration dashboard UI.
 */

import { PrismaClient } from "@prisma/client";
import { parseReportScoreBreakdown } from "../src/lib/parse-report";

const CALIBRATION_PREFIX = "[CAL]";

type CategoryKey = "schema" | "crawler" | "trust" | "content" | "brand" | "tech";

type RunSnapshot = {
  id: string;
  url: string;
  label: string;
  status: string;
  oldOverall: number | null;
  oldByCat: Record<CategoryKey, number | null>;
  newOverall: number | null;
  newByCat: Record<CategoryKey, number | null>;
  delta: number | null;
};

const MAX_BY_CAT: Record<CategoryKey, number> = {
  schema: 25,
  crawler: 20,
  trust: 20,
  content: 15,
  brand: 10,
  tech: 10,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * v2 ladder projection — maps an old (band-based) score to its
 * approximate v2 (ladder-based) equivalent.
 *
 * Schema is the biggest correction: under v1 a typical local biz
 * with no JSON-LD landed at 4–5 (soft floor); under v2 the same
 * site with clean HTML identity earns the "10 = basic readable
 * structure" rung.
 */
function projectCategoryV2(key: CategoryKey, old: number | null): number | null {
  if (old === null) return null;
  let next = old;
  switch (key) {
    case "schema":
      // Biggest corrective. Lift the 31–44 cluster off the floor.
      if (old <= 4) next = 8;
      else if (old <= 6) next = 10;
      else if (old <= 10) next = 12;
      else if (old <= 15) next = 15;
      // 16+ already on the right rung — leave alone.
      break;
    case "crawler":
      // v1 ceiling at 12 (no llms.txt) is exactly the v2 "12 rung".
      // Sites at the v1 ceiling of 12 land at 15 under v2 because
      // the ceiling is gone (sitemap + crawlable now reach 15).
      if (old >= 9 && old <= 12) next = 15;
      else if (old >= 13 && old <= 15) next = 16;
      // Lower scores (blocked / unclear) stay at the bottom rung.
      break;
    case "trust":
      // STRICTER under v2 — v1 was inflating "claimed 4+ pillars"
      // when only 2–3 had real evidence. Pull those down.
      if (old >= 14 && old <= 17) next = old - 2;
      // Mid and low band stay where they were — the v2 ladder
      // rungs at 4 / 8 / 12 line up with the v1 numeric values.
      break;
    case "content":
      // Modest lift through the mid-band.
      if (old >= 4 && old <= 7) next = old + 2;
      else if (old >= 8 && old <= 10) next = old + 2;
      // Marketing-only homepages stay capped.
      break;
    case "brand":
    case "tech":
      // Small categories — ladder values close to additive. Slight
      // upward correction in the mid-band where v1 was conservative.
      if (old >= 3 && old <= 6) next = old + 1;
      break;
  }
  return clamp(Math.round(next), 0, MAX_BY_CAT[key]);
}

function bandFor(overall: number | null): string {
  if (overall === null) return "Unscored";
  if (overall >= 81) return "AI-Ready";
  if (overall >= 66) return "Competitive";
  if (overall >= 46) return "Needs Work";
  if (overall >= 26) return "At Risk";
  return "Invisible";
}

const ARCHETYPES: Array<{
  name: string;
  scores: Record<CategoryKey, number>;
}> = [
  // 2 weak
  {
    name: "Weak A — broken-ish, near-empty content",
    scores: { schema: 1, crawler: 4, trust: 3, content: 3, brand: 2, tech: 4 },
  },
  {
    name: "Weak B — basic site, no trust, blocked bots",
    scores: { schema: 4, crawler: 6, trust: 5, content: 4, brand: 4, tech: 5 },
  },
  // 2 average
  {
    name: "Average A — typical local biz, no schema",
    scores: { schema: 4, crawler: 11, trust: 10, content: 5, brand: 5, tech: 5 },
  },
  {
    name: "Average B — small biz with reviews + service area",
    scores: { schema: 5, crawler: 12, trust: 13, content: 6, brand: 6, tech: 6 },
  },
  // 2 strong
  {
    name: "Strong A — partial LocalBusiness + FAQ + good content",
    scores: { schema: 13, crawler: 12, trust: 14, content: 9, brand: 7, tech: 7 },
  },
  {
    name: "Strong B — full LocalBusiness + reviews + multi-page",
    scores: { schema: 18, crawler: 14, trust: 16, content: 11, brand: 8, tech: 8 },
  },
  // 1 elite
  {
    name: "Elite — full schema + llms.txt + deep content",
    scores: { schema: 23, crawler: 19, trust: 18, content: 14, brand: 9, tech: 9 },
  },
];

function projectArchetype(scores: Record<CategoryKey, number>) {
  const next: Record<CategoryKey, number> = {
    schema: projectCategoryV2("schema", scores.schema)!,
    crawler: projectCategoryV2("crawler", scores.crawler)!,
    trust: projectCategoryV2("trust", scores.trust)!,
    content: projectCategoryV2("content", scores.content)!,
    brand: projectCategoryV2("brand", scores.brand)!,
    tech: projectCategoryV2("tech", scores.tech)!,
  };
  const oldTotal =
    scores.schema + scores.crawler + scores.trust + scores.content + scores.brand + scores.tech;
  const newTotal =
    next.schema + next.crawler + next.trust + next.content + next.brand + next.tech;
  return { next, oldTotal, newTotal };
}

function printArchetypeReport() {
  console.log("\n========== ARCHETYPE PROJECTION (v1 → v2) ==========\n");
  console.log(
    "name".padEnd(54) +
      "v1 → v2".padEnd(15) +
      "band move".padEnd(28) +
      "Δ",
  );
  console.log("-".repeat(100));
  for (const a of ARCHETYPES) {
    const { oldTotal, newTotal } = projectArchetype(a.scores);
    const oldBand = bandFor(oldTotal);
    const newBand = bandFor(newTotal);
    const delta = newTotal - oldTotal;
    console.log(
      a.name.padEnd(54) +
        `${oldTotal} → ${newTotal}`.padEnd(15) +
        `${oldBand} → ${newBand}`.padEnd(28) +
        `${delta >= 0 ? "+" : ""}${delta}`,
    );
  }

  // Summary stats on the archetype set
  const oldTotals = ARCHETYPES.map((a) => projectArchetype(a.scores).oldTotal);
  const newTotals = ARCHETYPES.map((a) => projectArchetype(a.scores).newTotal);
  console.log("\n========== ARCHETYPE SET SPREAD ==========");
  console.log(
    `mean      old=${mean(oldTotals).toFixed(1).padEnd(6)}  new=${mean(newTotals).toFixed(1)}`,
  );
  console.log(
    `stdDev    old=${stddev(oldTotals).toFixed(2).padEnd(6)}  new=${stddev(newTotals).toFixed(2)}`,
  );
  console.log(
    `range     old=${Math.min(...oldTotals)}–${Math.max(...oldTotals).toString().padEnd(4)}  new=${Math.min(...newTotals)}–${Math.max(...newTotals)}`,
  );

  // Pairwise gaps between consecutive tiers (sorted)
  const sorted = [...newTotals].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  console.log(`tier gaps (v2): ${sorted.join(" → ")}  (gaps: ${gaps.join(", ")})`);

  console.log(
    "\n✅ Healthy v2 sample = each tier separated by ≥ 5 points, weak ≠ average ≠ strong ≠ elite.\n",
  );
}

async function main() {
  const archetypesOnly = process.argv.includes("--archetypes");
  const rerun = process.argv.includes("--rerun");

  if (archetypesOnly) {
    printArchetypeReport();
    return;
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.auditOrder.findMany({
      where: { businessName: { startsWith: CALIBRATION_PREFIX } },
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) {
      console.log(
        "No calibration rows found. Queue some at /admin/calibration first, or run with --archetypes for an offline projection.",
      );
      return;
    }
    console.log(`Loaded ${rows.length} calibration rows.\n`);

    const snapshots: RunSnapshot[] = rows.map((row) => {
      const score = parseReportScoreBreakdown(row.reportMarkdown);
      const oldByCat = {
        schema: score.categories.find((c) => c.key === "schema")?.score ?? null,
        crawler: score.categories.find((c) => c.key === "crawler")?.score ?? null,
        trust: score.categories.find((c) => c.key === "trust")?.score ?? null,
        content: score.categories.find((c) => c.key === "content")?.score ?? null,
        brand: score.categories.find((c) => c.key === "brand")?.score ?? null,
        tech: score.categories.find((c) => c.key === "tech")?.score ?? null,
      } as Record<CategoryKey, number | null>;
      const newByCat = {
        schema: projectCategoryV2("schema", oldByCat.schema),
        crawler: projectCategoryV2("crawler", oldByCat.crawler),
        trust: projectCategoryV2("trust", oldByCat.trust),
        content: projectCategoryV2("content", oldByCat.content),
        brand: projectCategoryV2("brand", oldByCat.brand),
        tech: projectCategoryV2("tech", oldByCat.tech),
      } as Record<CategoryKey, number | null>;
      const newOverall = Object.values(newByCat).every((v) => v === null)
        ? null
        : Object.values(newByCat).reduce<number>((a, b) => a + (b ?? 0), 0);
      return {
        id: row.id,
        url: row.websiteUrl,
        label:
          (row.businessName ?? row.websiteUrl).replace(CALIBRATION_PREFIX, "").trim() ||
          row.websiteUrl,
        status: row.reportStatus,
        oldOverall: score.overall,
        oldByCat,
        newOverall,
        newByCat,
        delta:
          score.overall !== null && newOverall !== null
            ? newOverall - score.overall
            : null,
      };
    });

    const scored = snapshots.filter((s) => s.oldOverall !== null);
    if (scored.length === 0) {
      console.log("No scored runs in the dataset yet.");
      return;
    }

    const oldOverall = scored.map((s) => s.oldOverall as number);
    const newOverall = scored.map((s) => s.newOverall ?? 0);

    console.log(`Scored runs: ${scored.length} (of ${snapshots.length} total).\n`);
    console.log("================ AGGREGATE ================");
    console.log("              old        projected    delta");
    const oldMean = mean(oldOverall);
    const newMean = mean(newOverall);
    console.log(
      `mean          ${oldMean.toFixed(2).padEnd(10)} ${newMean.toFixed(2).padEnd(12)} ${(newMean - oldMean >= 0 ? "+" : "")}${(newMean - oldMean).toFixed(2)}`,
    );
    const oldMed = median(oldOverall);
    const newMed = median(newOverall);
    console.log(
      `median        ${oldMed.toFixed(2).padEnd(10)} ${newMed.toFixed(2).padEnd(12)} ${(newMed - oldMed >= 0 ? "+" : "")}${(newMed - oldMed).toFixed(2)}`,
    );
    const oldSd = stddev(oldOverall);
    const newSd = stddev(newOverall);
    console.log(
      `stdDev (σ)    ${oldSd.toFixed(2).padEnd(10)} ${newSd.toFixed(2).padEnd(12)} ${(newSd - oldSd >= 0 ? "+" : "")}${(newSd - oldSd).toFixed(2)}`,
    );
    console.log(
      `range         ${`${Math.min(...oldOverall)}–${Math.max(...oldOverall)}`.padEnd(10)} ${`${Math.min(...newOverall)}–${Math.max(...newOverall)}`.padEnd(12)}`,
    );

    console.log("\n============ BAND DISTRIBUTION ============");
    const bands = ["Invisible", "At Risk", "Needs Work", "Competitive", "AI-Ready"];
    const oldBandCounts: Record<string, number> = {};
    const newBandCounts: Record<string, number> = {};
    for (const b of bands) {
      oldBandCounts[b] = 0;
      newBandCounts[b] = 0;
    }
    for (const s of scored) {
      oldBandCounts[bandFor(s.oldOverall)]++;
      newBandCounts[bandFor(s.newOverall)]++;
    }
    const total = scored.length;
    console.log("band            old              projected");
    for (const b of bands) {
      const oldN = oldBandCounts[b];
      const newN = newBandCounts[b];
      const oldPct = ((oldN / total) * 100).toFixed(1).padStart(5);
      const newPct = ((newN / total) * 100).toFixed(1).padStart(5);
      console.log(
        `${b.padEnd(15)} ${`${oldN}`.padStart(3)} (${oldPct}%)    ${`${newN}`.padStart(3)} (${newPct}%)`,
      );
    }

    // ============ DISTRIBUTION HEALTH ============
    console.log("\n========== DISTRIBUTION HEALTH ==========");
    const newCategoryAverages: Record<CategoryKey, number | null> = {
      schema: catAverage(scored, "schema"),
      crawler: catAverage(scored, "crawler"),
      trust: catAverage(scored, "trust"),
      content: catAverage(scored, "content"),
      brand: catAverage(scored, "brand"),
      tech: catAverage(scored, "tech"),
    };
    const lowCats = (Object.entries(newCategoryAverages) as Array<[CategoryKey, number | null]>)
      .filter(([k, v]) => v !== null && v < MAX_BY_CAT[k] * 0.3)
      .map(([k]) => k);
    const populatedBands = bands.filter((b) => newBandCounts[b] > 0).length;
    const spreadLabel =
      newSd < 8 ? "tight" : newSd >= 14 ? "healthy" : "moderate";
    const ceilingEvidence = lowCats.length > 0;
    let verdict: "compressed" | "improving" | "healthy_v2";
    if (newSd < 8 || populatedBands < 3 || ceilingEvidence) {
      verdict = "compressed";
    } else if (newSd >= 14 && populatedBands >= 4 && !ceilingEvidence) {
      verdict = "healthy_v2";
    } else {
      verdict = "improving";
    }
    console.log(`spread_quality:   ${spreadLabel}   (σ ${newSd.toFixed(2)})`);
    console.log(
      `band_coverage:    ${populatedBands} / 5   (${bands.filter((b) => newBandCounts[b] > 0).join(", ")})`,
    );
    console.log(
      `ceiling_evidence: ${ceilingEvidence ? "yes" : "no"}${
        ceilingEvidence ? `   (${lowCats.join(", ")} averaging < 30% of max)` : ""
      }`,
    );
    console.log(`verdict:          ${verdict.toUpperCase()}`);
    if (verdict === "compressed") {
      console.log(
        `\n⚠  v2 projection is still compressed. Likely cause: ${
          lowCats.length > 0
            ? `category averages still below the floor → ${lowCats.join(", ")}`
            : populatedBands < 3
              ? "fewer than 3 bands populated"
              : "stdDev under 8 — sample lacks variety"
        }.`,
      );
    } else if (verdict === "healthy_v2") {
      console.log(
        "\n✅ v2 projection is healthy — variance, band coverage, and category averages all look right.",
      );
    } else {
      console.log(
        "\n→ Improving from v1, but not yet healthy. Re-run on real audits to confirm.",
      );
    }

    console.log("\n========== TOP 10 BIGGEST MOVERS ==========");
    const movers = scored
      .filter((s) => s.delta !== null)
      .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
      .slice(0, 10);
    for (const m of movers) {
      const dir = (m.delta ?? 0) >= 0 ? "+" : "";
      console.log(
        `${m.label.slice(0, 38).padEnd(40)}  ${m.oldOverall} → ${m.newOverall} (${dir}${m.delta})  band ${bandFor(m.oldOverall)} → ${bandFor(m.newOverall)}`,
      );
      const reasons = explainMove(m);
      if (reasons) console.log(`    ${reasons}`);
    }

    if (rerun) {
      console.log(
        "\n--rerun flag set. Re-queueing every calibration row so the worker re-audits them under the new rubric.",
      );
      const upd = await prisma.auditOrder.updateMany({
        where: { businessName: { startsWith: CALIBRATION_PREFIX } },
        data: {
          reportStatus: "queued",
          reportQueuedAt: new Date(),
          reportStartedAt: null,
          reportError: null,
        },
      });
      console.log(`Re-queued ${upd.count} rows. Watch /admin/calibration for live progress.`);
    } else {
      console.log(
        "\nProjection only. Pass --rerun to re-queue these rows for a real recompute under the new rubric:",
      );
      console.log("  npx tsx scripts/calibration-recalc.ts --rerun");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function explainMove(s: RunSnapshot): string | null {
  const parts: string[] = [];
  for (const k of ["schema", "crawler", "trust", "content", "brand", "tech"] as CategoryKey[]) {
    const oldV = s.oldByCat[k];
    const newV = s.newByCat[k];
    if (oldV === null || newV === null) continue;
    const d = newV - oldV;
    if (d !== 0) parts.push(`${k} ${oldV}→${newV}`);
  }
  return parts.length === 0 ? null : `[${parts.join(", ")}]`;
}

function catAverage(
  scored: RunSnapshot[],
  key: CategoryKey,
): number | null {
  const vals = scored
    .map((s) => s.newByCat[key])
    .filter((v): v is number => typeof v === "number");
  return vals.length === 0 ? null : mean(vals);
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mu = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
