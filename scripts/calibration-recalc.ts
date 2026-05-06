/**
 * Calibration recalibration projector — Iteration #1.
 *
 * Reads every existing calibration run from the database (tagged
 * AuditOrder rows where `businessName` starts with "[CAL]"),
 * projects what each one *would* score under the rebalanced
 * additive rubric, and prints a side-by-side summary:
 *
 *   - old mean / median / stdDev
 *   - projected mean / median / stdDev
 *   - band distribution before vs after
 *   - top 5 sites that move the most (with reasons)
 *
 * NOTE: This is a *projection*, not a true rerun. The new rubric
 * has different sub-checks; we don't have the original evidence.
 * Instead we apply a calibrated transformation per category that
 * mirrors the additive scheme's expected behavior on the OLD
 * (band-based) score:
 *
 *   - schema  : add ~+2–4 if old score 1–6 (the old hard floor that
 *               local businesses without JSON-LD systematically hit
 *               but had clear HTML identity).
 *   - crawler : add ~+3–5 if old score 9–12 (the old llms.txt
 *               ceiling — sites with citation bots reachable but
 *               no llms.txt no longer get capped).
 *   - trust   : add ~+2–4 if old score 8–13 (mid-band sites that
 *               had 2–3 pillars now earn more per pillar).
 *   - content : add ~+1–3 if old score 4–7 (thin-pages-no-FAQ
 *               soft floor relaxed slightly).
 *   - brand / : essentially unchanged — additive vs band-based
 *     tech     yields similar values for the small categories.
 *
 * After computing the projection, this script ALSO offers a
 * `--rerun` mode that flips reportStatus back to "queued" for
 * every calibration row, so the worker re-audits them under the
 * new rubric and the dashboard reflects real recomputed scores.
 *
 * Usage:
 *   npx tsx scripts/calibration-recalc.ts            # projection only
 *   npx tsx scripts/calibration-recalc.ts --rerun    # also re-queue
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

function projectCategory(key: CategoryKey, old: number | null): number | null {
  if (old === null) return null;
  // Calibrated bumps based on where the old score landed in each
  // category's compression zone. See header comment for rationale.
  let next = old;
  switch (key) {
    case "schema":
      // Old hard floor was 0–6. Sites with NO JSON-LD but clear
      // HTML identity now earn the +5 soft-floor bump.
      if (old >= 1 && old <= 6) next = old + 4;
      else if (old >= 7 && old <= 9) next = old + 2;
      break;
    case "crawler":
      // Old ceiling at 12 (no llms.txt). Removed — citation bots +
      // sitemap + crawlable can now reach 15.
      if (old >= 9 && old <= 12) next = old + 4;
      else if (old >= 13 && old <= 15) next = old + 1;
      break;
    case "trust":
      // Mid-band sites (2–3 pillars) under-earned. Bump them.
      if (old >= 6 && old <= 13) next = old + 3;
      else if (old >= 14) next = old + 1;
      break;
    case "content":
      // Old soft floor at ≤5 for thin-pages-no-FAQ. Slight relief
      // when at least some service content exists.
      if (old >= 3 && old <= 7) next = old + 2;
      else if (old >= 8 && old <= 11) next = old + 1;
      break;
    case "brand":
    case "tech":
      // Small categories — additive scoring lands near the same value.
      next = old;
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

async function main() {
  const rerun = process.argv.includes("--rerun");
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.auditOrder.findMany({
      where: { businessName: { startsWith: CALIBRATION_PREFIX } },
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) {
      console.log("No calibration rows found. Queue some at /admin/calibration first.");
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
        schema: projectCategory("schema", oldByCat.schema),
        crawler: projectCategory("crawler", oldByCat.crawler),
        trust: projectCategory("trust", oldByCat.trust),
        content: projectCategory("content", oldByCat.content),
        brand: projectCategory("brand", oldByCat.brand),
        tech: projectCategory("tech", oldByCat.tech),
      } as Record<CategoryKey, number | null>;
      const newOverall =
        Object.values(newByCat).every((v) => v === null)
          ? null
          : Object.values(newByCat).reduce<number>(
              (a, b) => a + (b ?? 0),
              0,
            );
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
    const newOverall = scored.map((s) => (s.newOverall ?? 0));

    console.log(`Scored runs: ${scored.length} (of ${snapshots.length} total).\n`);
    console.log("================ AGGREGATE ================");
    console.log(
      `              old        projected    delta`,
    );
    const oldMean = mean(oldOverall);
    const newMean = mean(newOverall);
    console.log(
      `mean          ${oldMean.toFixed(2).padEnd(10)} ${newMean
        .toFixed(2)
        .padEnd(12)} ${(newMean - oldMean >= 0 ? "+" : "")}${(newMean - oldMean).toFixed(2)}`,
    );
    const oldMed = median(oldOverall);
    const newMed = median(newOverall);
    console.log(
      `median        ${oldMed.toFixed(2).padEnd(10)} ${newMed
        .toFixed(2)
        .padEnd(12)} ${(newMed - oldMed >= 0 ? "+" : "")}${(newMed - oldMed).toFixed(2)}`,
    );
    const oldSd = stddev(oldOverall);
    const newSd = stddev(newOverall);
    console.log(
      `stdDev (σ)    ${oldSd.toFixed(2).padEnd(10)} ${newSd
        .toFixed(2)
        .padEnd(12)} ${(newSd - oldSd >= 0 ? "+" : "")}${(newSd - oldSd).toFixed(2)}`,
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
