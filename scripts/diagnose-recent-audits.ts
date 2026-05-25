/* eslint-disable no-console */
/**
 * Read-only investigation for the score-consistency bug on report
 * cmp2ip6q00005yqfehx9h1d2l (littekenplumbing.com). Pulls the full
 * row + reportMarkdown so we can compare:
 *   • hero/overall score the parser extracts (what the customer sees)
 *   • per-category sub-scores the parser extracts
 *   • the weighted sum the rubric IMPLIES
 *   • any rubric-math/appendix totals the model emits
 *
 * Read-only. Not committed.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { parseReportScoreBreakdown } from "../src/lib/parse-report";

const TARGET_ID = "cmp2ip6q00005yqfehx9h1d2l";

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.auditOrder.findUnique({
    where: { id: TARGET_ID },
    select: {
      id: true,
      websiteUrl: true,
      businessName: true,
      reportStatus: true,
      reportMarkdown: true,
      reportGeneratedAt: true,
      intelligence: {
        select: {
          overallScore: true,
          semanticClarityScore: true,
          crawlerAccessibilityScore: true,
          trustSignalScore: true,
          structuredIdentityScore: true,
          recommendationReadinessScore: true,
          renderabilityScore: true,
          rawSignalSnapshot: true,
        },
      },
    },
  });

  if (!row) {
    console.log(`NOT FOUND: ${TARGET_ID}`);
    await prisma.$disconnect();
    return;
  }

  console.log("─── ROW ───");
  console.log(`id=${row.id}`);
  console.log(`url=${row.websiteUrl}`);
  console.log(`business=${row.businessName}`);
  console.log(`reportStatus=${row.reportStatus}`);
  console.log(`reportGeneratedAt=${row.reportGeneratedAt?.toISOString()}`);

  // 1. What does the parser extract?
  const md = row.reportMarkdown ?? "";
  const parsed = parseReportScoreBreakdown(md);
  console.log("\n─── PARSER OUTPUT ───");
  console.log(`overall (parsed): ${parsed.overall}  status="${parsed.status}"`);
  console.log("categories:");
  let weightedSum = 0;
  let weightTotal = 0;
  for (const c of parsed.categories) {
    console.log(`  ${c.key.padEnd(10)} ${c.score ?? "?"}/${c.max}  (${c.label})`);
    if (typeof c.score === "number") {
      weightedSum += c.score;
      weightTotal += c.max;
    }
  }
  console.log(`\nSum of sub-scores (out of ${weightTotal}): ${weightedSum}/100`);

  // 2. What does the intelligence row record?
  console.log("\n─── INTELLIGENCE ROW ───");
  const i = row.intelligence;
  if (i) {
    console.log(`overallScore (persisted): ${i.overallScore}`);
    console.log(`sub-scores (normalized 0–100):`);
    console.log(`  semanticClarity:         ${i.semanticClarityScore}`);
    console.log(`  crawlerAccessibility:    ${i.crawlerAccessibilityScore}`);
    console.log(`  trustSignal:             ${i.trustSignalScore}`);
    console.log(`  structuredIdentity:      ${i.structuredIdentityScore}`);
    console.log(`  recommendationReadiness: ${i.recommendationReadinessScore}`);
    console.log(`  renderability:           ${i.renderabilityScore}`);
    if (i.rawSignalSnapshot && typeof i.rawSignalSnapshot === "object") {
      const snap = i.rawSignalSnapshot as Record<string, unknown>;
      const parsedScore = snap.parsedScore as
        | { overall: number | null; categories?: Array<{ key: string; score: number | null; max: number }> }
        | undefined;
      if (parsedScore) {
        console.log(`\n  rawSignalSnapshot.parsedScore.overall: ${parsedScore.overall}`);
        if (parsedScore.categories) {
          console.log(`  rawSignalSnapshot.parsedScore.categories:`);
          for (const c of parsedScore.categories) {
            console.log(`    ${c.key} ${c.score}/${c.max}`);
          }
        }
      }
    }
  } else {
    console.log("(no intelligence row)");
  }

  // 3. Hunt for every numeric score reference in the markdown.
  console.log("\n─── SCORE MENTIONS IN MARKDOWN ───");
  const overallHits = [
    ...md.matchAll(/Overall\s*Score[:\s]*\*?\*?(\d{1,3})\s*\/\s*100/gi),
  ];
  for (const h of overallHits) {
    console.log(`  Overall Score line: "${h[0]}"`);
  }
  // Total / Final / Adjusted hits
  const totalHits = [
    ...md.matchAll(/(?:Base\s*Total|Final\s*Score|Adjusted|TOTAL)[:\s|]*\*?\*?(\d{1,3})\s*(?:\/\s*100)?/gi),
  ];
  for (const h of totalHits.slice(0, 10)) {
    console.log(`  Total-style line: "${h[0]}"`);
  }
  // All <N>/100 hits
  const allHits = [...md.matchAll(/\b(\d{1,3})\s*\/\s*100\b/g)];
  console.log(`\n  All "<N>/100" occurrences (showing first 20):`);
  for (const h of allHits.slice(0, 20)) {
    const idx = h.index ?? 0;
    const ctx = md.slice(Math.max(0, idx - 30), idx + 20).replace(/\n/g, " ↵ ");
    console.log(`    ...${ctx}...`);
  }

  console.log("\n─── FULL REPORT MARKDOWN ───\n");
  console.log(md);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
