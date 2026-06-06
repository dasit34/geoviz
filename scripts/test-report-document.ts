/* eslint-disable no-console */
/**
 * scripts/test-report-document.ts
 *
 * Guards the new fixed-template renderer + its wiring:
 *   - ReportDocument renders the fixed section order (Executive Summary →
 *     AI Platform Readiness → Visibility Diagnostics → Priority Fixes →
 *     Strategic Action Plan → Appendix) with fixed numbering;
 *   - all three surfaces (PDF print page, admin ReportViewerClient,
 *     public sample) render through ReportSurface (single renderer);
 *   - ReportSurface consumes the ReportModel (no per-surface divergence).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

console.log("[report-document] running...");

const DOC = read("src/components/report/ReportDocument.tsx");

check("fixed section order + numbering (two distinct AI sections)", () => {
  const order = [
    'n="01"',
    "Executive Summary",
    'n="02"',
    // Section 02 = the FOUR directly-tested model validators
    "Directly Tested AI Platforms",
    'n="03"',
    // Section 03 = derived AI-search/visibility readiness (NOT model scores)
    "AI Search & Visibility Readiness",
    'n="04"',
    "Visibility Diagnostics",
    'n="05"',
    "Priority Fixes",
    'n="06"',
    "Strategic Action Plan",
  ];
  let last = -1;
  for (const token of order) {
    const idx = DOC.indexOf(token);
    assert.ok(idx > last, `"${token}" out of fixed order`);
    last = idx;
  }
});

check("Google AI Overviews lives in readiness, labeled a readiness score (not a 5th model)", () => {
  // Section 02 (directly-tested models) must NOT name Google AI Overviews as a card
  const sec02 = DOC.slice(DOC.indexOf('n="02"'), DOC.indexOf('n="03"'));
  assert.doesNotMatch(
    sec02,
    /Overview/i,
    "Google AI Overviews must not appear among the directly-tested model cards",
  );
  // Section 03 renders readiness cards, derived from m.readiness, with a
  // "READINESS SCORE" label — never a direct model-validation score.
  assert.match(DOC, /ReadinessCard/);
  assert.match(DOC, /m\.readiness/);
  assert.match(DOC, /rd-readiness-tag/);
  assert.match(DOC, /READINESS SCORE/);
  // a disclaimer separating derived readiness from a direct model score
  assert.match(DOC, /rd-readiness-note/);
});

check("GeoViz logo mark is present on cover (lockup + watermark), section markers, and footer", () => {
  assert.match(DOC, /GeoVizMark/, "ReportDocument imports/uses the GeoViz logo mark");
  assert.match(DOC, /rd-cover-watermark/, "faint logo watermark behind the cover");
  assert.match(DOC, /rd-cover-lockup/, "cover logo lockup");
  assert.match(DOC, /rd-section-marker/, "each section header carries the logo marker");
  assert.match(DOC, /rd-footer-lockup/, "running footer carries the logo");
  // Brand System v2: the report consumes the SAME constellation mark as the
  // website/favicon/email. BrandMarks re-exports it from the shared brand
  // module so the report keeps importing { GeoVizMark } unchanged.
  const MARKS = read("src/components/report/BrandMarks.tsx");
  assert.match(
    MARKS,
    /export \{ GeoVizMark \} from "@\/components\/brand\/GeoVizMark"/,
    "report re-exports the canonical brand GeoVizMark",
  );
  const BRAND_MARK = read("src/components/brand/GeoVizMark.tsx");
  assert.match(BRAND_MARK, /function GeoVizMark/, "GeoVizMark is an inline-SVG mark");
  assert.match(BRAND_MARK, /<svg/, "GeoVizMark renders inline SVG (no icon package)");
});

check("renders the 4 AI-platform readiness bucket meters", () => {
  assert.match(DOC, /BucketRow/);
  assert.match(DOC, /rd-bucket-row/);
});

check("renders premium platform cards + comparison + diagnostics + fixes", () => {
  assert.match(DOC, /PlatformCard/);
  assert.match(DOC, /ComparisonStrip/);
  assert.match(DOC, /m\.diagnostics/);
  assert.match(DOC, /m\.fixes/);
});

// ── Iteration 2 — branding + executive feel ─────────────────────────
check("strong GeoViz branding: terrain cover bg, big logo, section chips, gauge", () => {
  const CSS = read("src/components/report/report-document.css");
  assert.match(CSS, /terrain-bg\.png/, "cover should use the terrain brand background");
  assert.match(DOC, /rd-cover-bg/);
  assert.match(DOC, /ScoreGauge/, "cover should render the score gauge");
  assert.match(DOC, /rd-section-brand/, "every section header carries a GeoViz brand chip");
  assert.match(DOC, /rd-footer-brand/);
});

check("uses provider logo marks", () => {
  const MARKS = read("src/components/report/BrandMarks.tsx");
  assert.match(MARKS, /export function ProviderMark/);
  for (const p of ["openai", "claude", "gemini", "perplexity"]) {
    assert.match(MARKS, new RegExp(`case "${p}"`), `missing mark for ${p}`);
  }
  assert.match(DOC, /<ProviderMark/);
});

check("executive scorecard tiles + key-takeaway insight panel", () => {
  assert.match(DOC, /rd-stat-tile/);
  assert.match(DOC, /rd-insight/);
  assert.match(DOC, /Key takeaway/i);
});

// ── single-renderer wiring across all surfaces ──────────────────────
const SURFACES: Array<[string, string]> = [
  ["PDF print page", "src/app/report/[id]/print/page.tsx"],
  ["admin preview", "src/components/ReportViewerClient.tsx"],
  ["public sample", "src/app/sample-report/[slug]/page.tsx"],
];
for (const [label, rel] of SURFACES) {
  check(`${label} renders through <ReportSurface />`, () => {
    const src = read(rel);
    assert.match(src, /<ReportSurface/, `${rel} does not render ReportSurface`);
    assert.doesNotMatch(
      src,
      /<AuditReportContent\b/,
      `${rel} still renders AuditReportContent directly`,
    );
  });
}

check("ReportSurface builds the model and renders ReportDocument", () => {
  const src = read("src/components/report/ReportSurface.tsx");
  assert.match(src, /buildReportModelFromRender/);
  assert.match(src, /<ReportDocument/);
  // legacy fallback preserved for old markdown-only audits
  assert.match(src, /AuditReportContent/);
});

if (failed > 0) {
  console.log(`[report-document] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[report-document] passed=${passed} failed=0`);
