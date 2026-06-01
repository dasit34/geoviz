/* eslint-disable no-console */
/**
 * scripts/test-score-source-parity.ts
 *
 * Regression guard for the admin-vs-PDF score divergence root-caused
 * during the Cutler Homes report review:
 *
 *   - PDF route (`src/app/report/[id]/print/page.tsx`) selects
 *     `intelligence.deterministicScore` and threads it into
 *     `getCanonicalScore()` — reads the canonical deterministic
 *     overall.
 *   - Admin preview (`src/components/AdminReportCard.tsx`) was
 *     calling `parseReportScore(markdown)` without the
 *     `intelligence` parameter, falling back to the legacy regex
 *     parser. Same audit, two different scores depending on surface.
 *
 * This test simulates BOTH render paths against a fixture where the
 * deterministic overall and the markdown's declared hero disagree.
 * If both surfaces don't agree on the canonical deterministic value,
 * the test fails.
 *
 * Also asserts that the admin preview always passes deterministicScore
 * through the relevant call sites by scanning the AdminReportCard
 * source for the prop being threaded.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseReportScore } from "../src/lib/parse-report-score";
import { getCanonicalScore } from "../src/lib/scoring/getCanonicalScore";

const REPO_ROOT = process.cwd();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    const line = `  ✗ ${label}${detail ? ` — ${detail}` : ""}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

// ── Fixture: a deterministicScore JSON whose overall (29) deliberately
//    differs from what a naïve regex on the markdown would pull (55).
const DETERMINISTIC_FIXTURE = {
  scoring_version: "scoring@1.0.0",
  overall_score: 29,
  band: "Limited Visibility",
  category_scores: {
    schema: { score: 2, max: 25 },
    crawler: { score: 7, max: 20 },
    trust: { score: 2, max: 20 },
    content: { score: 3, max: 15 },
    brand: { score: 6, max: 10 },
    tech: { score: 9, max: 10 },
  },
  synergy_bonus_applied: 0,
  confidence_level: "low",
  top_3_findings: [],
};

// A markdown fragment that would lead the legacy regex parser to
// extract "55/100 Needs Work" — disagreeing with the canonical 29.
const MISMATCHED_MARKDOWN =
  "## Overall Score\n\n**55/100 — Needs Work**\n\n" +
  "Structured Data / Schema: 12/25\n" +
  "AI Crawler Readiness: 14/20\n" +
  "Local Trust Signals: 10/20\n" +
  "Content Depth + FAQ Quality: 8/15\n" +
  "Brand / Entity Clarity: 5/10\n" +
  "Technical Accessibility: 6/10\n";

console.log("[score-source-parity] running...");

// ── Test 1: PDF render path (deterministic present)
const pdfScore = getCanonicalScore({
  reportMarkdown: MISMATCHED_MARKDOWN,
  intelligence: { deterministicScore: DETERMINISTIC_FIXTURE },
});
check(
  "PDF path reads deterministic when present",
  pdfScore.overall === 29,
  `got ${pdfScore.overall}, expected 29`,
);

// ── Test 2: admin path WITH the fix (deterministic threaded)
const adminFixed = parseReportScore(MISMATCHED_MARKDOWN, {
  deterministicScore: DETERMINISTIC_FIXTURE,
});
check(
  "Admin path reads deterministic when threaded (the fix)",
  adminFixed !== null && adminFixed.score === 29,
  `got ${adminFixed?.score}, expected 29`,
);

// ── Test 3: PARITY — both paths agree
check(
  "Admin and PDF report the same overall (parity)",
  adminFixed?.score === pdfScore.overall,
  `admin=${adminFixed?.score} vs pdf=${pdfScore.overall}`,
);

// ── Test 4: regression — without the intelligence arg, admin falls
// back to the markdown's hero, diverging from PDF. This test pins
// the failure mode so any future re-introduction of the bug at the
// call site is caught.
const adminBuggy = parseReportScore(MISMATCHED_MARKDOWN);
check(
  "Without the intelligence arg, admin diverges from PDF (failure mode pinned)",
  adminBuggy !== null && adminBuggy.score !== pdfScore.overall,
  `admin-buggy=${adminBuggy?.score} happened to equal pdf=${pdfScore.overall}`,
);

// ── Test 5: source-level guard — AdminReportCard must pass
// `deterministicScore` to BOTH parseReportScore() and
// <ReportViewerClient />.
const adminCard = readFileSync(
  join(REPO_ROOT, "src/components/AdminReportCard.tsx"),
  "utf8",
);
const parseCallHasIntelligence = /parseReportScore\(\s*markdown\s*,/.test(
  adminCard,
);
check(
  "AdminReportCard.tsx: parseReportScore() is called with intelligence",
  parseCallHasIntelligence,
  "expected `parseReportScore(markdown, { deterministicScore })`",
);
const viewerCallHasDeterministic =
  /<ReportViewerClient[\s\S]*?deterministicScore=\{/.test(adminCard);
check(
  "AdminReportCard.tsx: <ReportViewerClient /> receives deterministicScore",
  viewerCallHasDeterministic,
  "expected `deterministicScore={deterministicScore}` on the ReportViewerClient",
);

// ── Test 6: admin/reports page selects deterministicScore in the
// Prisma include so the prop is actually populated end-to-end.
const reportsPage = readFileSync(
  join(REPO_ROOT, "src/app/admin/reports/page.tsx"),
  "utf8",
);
check(
  "admin/reports page selects deterministicScore from intelligence",
  /deterministicScore:\s*true/.test(reportsPage),
  "expected `deterministicScore: true` inside the `intelligence.select` block",
);

if (failed > 0) {
  console.log(`[score-source-parity] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[score-source-parity] passed=${passed} failed=0`);
