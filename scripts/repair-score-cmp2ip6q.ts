/* eslint-disable no-console */
/**
 * scripts/repair-score-cmp2ip6q.ts
 *
 * One-off repair for report cmp2ip6q00005yqfehx9h1d2l
 * (littekenplumbing.com, [CAL] calibration row, generated 2026-05-12).
 *
 * Bug:
 *   The model emitted internally inconsistent output —
 *     • Hero declared `Overall Score: 51/100`
 *     • Six sub-scores sum to 57 (14 + 8 + 12 + 9 + 8 + 6)
 *     • Appendix self-check claimed 61 via a Structural Synergy Bonus
 *       that does NOT pass its CLAUDE.md gates
 *       (Content 9 < 12, Tech 6 < 7, Crawler 8 < 15)
 *   The parser trusted the model's hero (51) and persisted that.
 *
 * Canonical answer = 57 (sum of sub-scores; each `category.max`
 * already encodes its rubric weight, so the sum across all six IS
 * the 0–100 canonical score).
 *
 * Repair touches three things on the single row:
 *   1. `AuditOrder.reportMarkdown` — replace the single
 *      `**Overall Score: 51/100 — Needs Work**` line with the
 *      canonical `**Overall Score: 57/100 — Needs Work**`.
 *   2. `AuditIntelligence.overallScore` — 51 → 57.
 *   3. NOT touched: `rawSignalSnapshot.parsedScore.overall` — that's
 *      a forensic snapshot of "what the parser produced at the time".
 *      Leaving it preserves the audit trail. (Operator can grep it
 *      later to find other rows that may need the same repair.)
 *
 *   • Sub-scores are NOT touched (the rubric output stays canonical).
 *   • Recommendations, narrative findings, and the appendix prose
 *     are NOT touched — the customer-facing wording stays as the
 *     model emitted it.
 *   • Band label stays "Needs Work" (51, 57, and 61 all fall in the
 *     same 46–65 band).
 *
 * Dry-run by default. Pass `--apply` to write.
 *
 *   npx tsx scripts/repair-score-cmp2ip6q.ts          # dry-run
 *   npx tsx scripts/repair-score-cmp2ip6q.ts --apply  # write
 *
 * Idempotent: re-running with --apply after a successful run finds
 * no `Overall Score: 51/100` line to replace and exits cleanly.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { parseReportScoreBreakdown } from "../src/lib/parse-report";

const TARGET_ORDER_ID = "cmp2ip6q00005yqfehx9h1d2l";
const STALE_OVERALL = 51;
const CANONICAL_OVERALL = 57;
const STALE_HERO_LINE = `**Overall Score: ${STALE_OVERALL}/100 — Needs Work**`;
const CANONICAL_HERO_LINE = `**Overall Score: ${CANONICAL_OVERALL}/100 — Needs Work**`;

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log(
    `\n[repair-score] mode=${APPLY ? "APPLY" : "DRY-RUN"} target=${TARGET_ORDER_ID}`,
  );

  const row = await prisma.auditOrder.findUnique({
    where: { id: TARGET_ORDER_ID },
    select: {
      id: true,
      websiteUrl: true,
      reportStatus: true,
      reportMarkdown: true,
      intelligence: { select: { id: true, overallScore: true } },
    },
  });
  if (!row) {
    console.log(`\n[repair-score] row not found — nothing to do.\n`);
    await prisma.$disconnect();
    return;
  }
  if (row.reportStatus !== "generated") {
    console.log(
      `\n[repair-score] row is in status="${row.reportStatus}" — refusing to repair a non-generated row.\n`,
    );
    await prisma.$disconnect();
    return;
  }

  const md = row.reportMarkdown ?? "";

  // Verify the canonical math against the actual persisted markdown
  // BEFORE touching anything. This is the safety check the user
  // explicitly asked for ("Do NOT blindly hardcode 61 unless the
  // final weighted rubric calculation confirms 61.").
  const parsed = parseReportScoreBreakdown(md);
  const subs = parsed.categories
    .map((c) => (typeof c.score === "number" ? c.score : null))
    .filter((n): n is number => n !== null);
  const computedSum = subs.reduce((a, b) => a + b, 0);

  console.log(`  url=${row.websiteUrl}`);
  console.log(`  reportStatus=${row.reportStatus}`);
  console.log(`  current persisted overallScore (intelligence): ${row.intelligence?.overallScore ?? "?"}`);
  console.log(`  parser.declaredOverall (model's hero):         ${parsed.declaredOverall}`);
  console.log(`  parser.rubricSum (sum of sub-scores):          ${parsed.rubricSum}`);
  console.log(`  parser.overall (canonical after fix):          ${parsed.overall}`);
  console.log(`  re-computed sub-score sum:                     ${computedSum}`);

  // Hard safety: refuse to apply unless the math agrees with the
  // canonical we expect. Catches the case where the row was already
  // partially repaired or where the model emitted different sub-scores
  // than the bug report assumed.
  if (computedSum !== CANONICAL_OVERALL) {
    console.error(
      `\n[repair-score] REFUSED — computed sum=${computedSum} does not match expected canonical=${CANONICAL_OVERALL}. Inspect manually.\n`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  if (parsed.declaredOverall !== STALE_OVERALL) {
    console.log(
      `\n[repair-score] declared overall is already ${parsed.declaredOverall}, not ${STALE_OVERALL} — nothing to do.\n`,
    );
    await prisma.$disconnect();
    return;
  }
  if (!md.includes(STALE_HERO_LINE)) {
    console.log(
      `\n[repair-score] hero line "${STALE_HERO_LINE}" not found in markdown — nothing to do.\n`,
    );
    await prisma.$disconnect();
    return;
  }

  const repairedMarkdown = md.replace(STALE_HERO_LINE, CANONICAL_HERO_LINE);
  console.log(
    `\n[repair-score] hero line replacement preview:\n  from: ${STALE_HERO_LINE}\n  to:   ${CANONICAL_HERO_LINE}\n`,
  );

  if (!APPLY) {
    console.log("[repair-score] DRY-RUN complete. Re-run with --apply to write.\n");
    await prisma.$disconnect();
    return;
  }

  try {
    await prisma.$transaction([
      prisma.auditOrder.update({
        where: { id: row.id },
        data: { reportMarkdown: repairedMarkdown },
      }),
      ...(row.intelligence
        ? [
            prisma.auditIntelligence.update({
              where: { id: row.intelligence.id },
              data: { overallScore: CANONICAL_OVERALL },
            }),
          ]
        : []),
    ]);
    console.log(
      `[geo-score-consistency] repaired orderId=${row.id} overallScore: ${STALE_OVERALL} → ${CANONICAL_OVERALL}`,
    );
    console.log(`[repair-score] complete ✓\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[repair-score] FAILED orderId=${row.id}: ${message}\n`);
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[repair-score] fatal:", err);
  process.exit(1);
});
