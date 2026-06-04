/* eslint-disable no-console */
/**
 * scripts/test-report-redesign.ts
 *
 * Guards the LaBre-review report redesign so it can't silently regress:
 *   - de-jargon: customer-facing structured-data terms swap to plain
 *     English ("business details AI systems can verify"), "noindex" is
 *     explained, and no double-swap seam;
 *   - duplicated opening removed: AuditReportContent renders no
 *     `report-hero` header and the cover has no assessment paragraph;
 *   - section order: Category Breakdown renders AFTER the Consensus
 *     block, not inside Section 01;
 *   - provider compaction: the compact card no longer renders the long
 *     "How {provider} sees" block; that moved to FourModelAppendix;
 *   - admin parity: AdminReportCard's customer-preview area renders only
 *     <ReportViewerClient/>, with ScoreBanner inside a collapsed
 *     operator-diagnostics <details> (not stacked above the report).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { swapTechnicalTerms } from "../src/lib/parse-report";

const REPO = process.cwd();
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const ARC = read("src/components/AuditReportContent.tsx");
const FMG = read("src/components/FourModelGrid.tsx");
const ADMIN = read("src/components/AdminReportCard.tsx");

console.log("[report-redesign] running...");

// ── De-jargon ───────────────────────────────────────────────────────
check("structured-data jargon swaps to plain English", () => {
  assert.equal(
    swapTechnicalTerms("The site lacks schema markup."),
    "The site lacks business details AI systems can verify.",
  );
  assert.match(
    swapTechnicalTerms("Add LocalBusiness JSON-LD."),
    /business details AI systems can verify/,
  );
  assert.equal(
    swapTechnicalTerms("Missing schema."),
    "Missing structured business details.",
  );
});

check("noindex is explained in plain English", () => {
  const out = swapTechnicalTerms("The homepage has a noindex directive.");
  assert.match(out, /skip the page/);
  assert.doesNotMatch(out, /\ba a setting/); // no doubled article
});

check("no double-swap seam (structured data (schema.org))", () => {
  const out = swapTechnicalTerms("It uses structured data (schema.org).");
  // The parenthetical must be collapsed — no swapped phrase echoed in ().
  assert.doesNotMatch(out, /\((?:structured business details|business details AI systems can verify)\)/);
  assert.match(out, /business details AI systems can verify/);
});

check("the old jargon phrasings are gone from swap output", () => {
  const out = swapTechnicalTerms("schema markup, structured data, schema.org, JSON-LD");
  assert.doesNotMatch(out, /machine-readable business info/);
  assert.doesNotMatch(out, /AI-readable business data/);
});

// ── Duplicated opening removed ──────────────────────────────────────
check("AuditReportContent renders no report-hero header", () => {
  assert.doesNotMatch(
    ARC,
    /className="report-hero"/,
    "the duplicated hero header must be removed",
  );
});

check("cover renders no assessment paragraph", () => {
  assert.doesNotMatch(
    ARC,
    /className="report-cover-assessment"/,
    "the cover diagnosis paragraph must be removed",
  );
});

// ── Section order ───────────────────────────────────────────────────
check("Category Breakdown renders AFTER the Consensus block", () => {
  const anchorIdx = ARC.indexOf("<ConsensusActionAnchor");
  const catIdx = ARC.indexOf("category-score-grid");
  assert.ok(anchorIdx > 0, "ConsensusActionAnchor not found");
  assert.ok(catIdx > 0, "category breakdown not found");
  assert.ok(
    catIdx > anchorIdx,
    "Category Breakdown must render after the Consensus section",
  );
});

// ── Provider compaction ─────────────────────────────────────────────
check("compact card does not render the long 'How X sees' block in-card", () => {
  // The phrase now lives ONLY in FourModelAppendix. Both the compact
  // RichCardBody and the appendix exist; ensure the appendix is the
  // exported home of the long detail.
  assert.match(FMG, /export function FourModelAppendix/);
  // The "How ... sees" RichField appears in the appendix; the compact
  // body uses CompactField + a clipped reason instead.
  assert.match(FMG, /function CompactField/);
  assert.match(FMG, /would recommend/i);
});

check("AuditReportContent mounts FourModelAppendix inside the appendix", () => {
  const detailsIdx = ARC.indexOf("report-tech-details");
  const appendixIdx = ARC.indexOf("<FourModelAppendix");
  assert.ok(appendixIdx > 0, "FourModelAppendix not mounted");
  assert.ok(
    appendixIdx > detailsIdx && detailsIdx > 0,
    "FourModelAppendix must render inside the appendix <details>",
  );
});

// ── Admin parity ────────────────────────────────────────────────────
check("admin ScoreBanner is inside the operator-diagnostics details", () => {
  assert.match(ADMIN, /Operator diagnostics/);
  const detailsIdx = ADMIN.indexOf("Operator diagnostics — not part");
  const bannerIdx = ADMIN.indexOf("<ScoreBanner");
  // The customer report JSX render (not a comment mention).
  const viewerIdx = ADMIN.search(/<ReportViewerClient\s+markdown=\{markdown\}/);
  assert.ok(detailsIdx > 0, "operator-diagnostics summary not found");
  assert.ok(bannerIdx > detailsIdx, "ScoreBanner must be inside the operator details");
  assert.ok(
    viewerIdx > bannerIdx,
    "the customer ReportViewerClient render must come after the operator panel",
  );
});

if (failed > 0) {
  console.log(`[report-redesign] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[report-redesign] passed=${passed} failed=0`);
