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

check("fixed 8-page order (Figma template)", () => {
  // The <article> composes the page components in fixed order — check the
  // first occurrence (the usage) of each component is in sequence.
  const order = [
    "CoverPage",
    "ExecutivePage",
    "PlatformsPage",
    "EvidencePage",
    "DiagnosticsPage",
    "IssuesPage",
    "FixesPage",
    "ActionPage",
  ];
  let last = -1;
  for (const token of order) {
    const idx = DOC.indexOf(token);
    assert.ok(idx > last, `"${token}" out of fixed order`);
    last = idx;
  }
  // each page title is present
  for (const t of [
    "Executive Summary",
    "AI Platform Results",
    "Evidence Reviewed",
    "Visibility Diagnostics",
    "Top Issues",
    "Priority Fix Plan",
    "Strategic Action Plan",
  ]) {
    assert.ok(DOC.includes(t), `missing page title: ${t}`);
  }
  // page numbers 01..08 present as header markers (prop n="NN" or text >NN<)
  for (const n of ["01", "02", "03", "04", "05", "06", "07", "08"]) {
    assert.ok(
      DOC.includes(`"${n}"`) || DOC.includes(`>${n}<`),
      `page number ${n} missing`,
    );
  }
});

check("Google AI Overviews stays a derived readiness lens (not a 5th tested model)", () => {
  // The 4 directly-tested provider cards come from m.providers; AI Overviews
  // is only in the readiness strip (m.readiness), never a provider card.
  assert.match(DOC, /m\.providers\.map/);
  assert.match(DOC, /ReadinessStrip/);
  assert.match(DOC, /m\.readiness/);
  // The provider list is the four LLMs only.
  const MODEL = read("src/lib/report/report-model.ts");
  assert.match(MODEL, /PROVIDER_ORDER = \["openai", "claude", "gemini", "perplexity"\]/);
});

check("real GeoViz constellation logo (no Figma placeholder, no text approximation)", () => {
  // Uses the shared brand mark + the GeoViz.ai wordmark lockup.
  assert.match(DOC, /from "@\/components\/brand\/GeoVizMark"/);
  assert.match(DOC, /<GeoVizMark/);
  assert.match(DOC, /rd-logo-word/);
  assert.match(DOC, /rd-logo-ai/);
  const BRAND_MARK = read("src/components/brand/GeoVizMark.tsx");
  assert.match(BRAND_MARK, /function GeoVizMark/);
  assert.match(BRAND_MARK, /<svg/, "GeoVizMark renders inline SVG (no icon package)");
});

check("cover score renders as clean HTML text (no SVG gauge dual-text)", () => {
  assert.match(DOC, /rd-score-num/);
  assert.match(DOC, /rd-score-max/);
  assert.doesNotMatch(DOC, /ScoreGauge/, "cover must not use the SVG gauge (text-extraction garble)");
});

check("light/dark page system: dark cover + CTA, light interior", () => {
  // Page variant is applied via <Page variant="dark|light"> → rd-page-${variant}.
  assert.match(DOC, /variant="dark"/);
  assert.match(DOC, /variant="light"/);
  assert.match(DOC, /rd-page-\$\{variant\}/);
  const CSS = read("src/components/report/report-document.css");
  assert.match(CSS, /\.rd-page-light/);
  assert.match(CSS, /\.rd-page-dark/);
  assert.match(CSS, /break-before: page/, "per-page print breaks");
});

check("Evidence Reviewed page renders inspected signals from preflight", () => {
  assert.match(DOC, /m\.evidence\.map/);
  assert.match(DOC, /EvidenceRow/);
  const MODEL = read("src/lib/report/report-model.ts");
  assert.match(MODEL, /function buildEvidence/);
  assert.match(MODEL, /preflightSignals/);
});

check("provider cards show verdict + understanding + reads-as + main gap", () => {
  assert.match(DOC, /PlatformCard/);
  assert.match(DOC, /Understanding/);
  assert.match(DOC, /Reads as/);
  assert.match(DOC, /Main gap/);
  assert.match(DOC, /verdictPill/);
});

check("priority fix cards: issue title is distinct from the exact-fix action", () => {
  assert.match(DOC, /f\.issue/);
  assert.match(DOC, /f\.action/);
  assert.match(DOC, /Exact fix/);
  const MODEL = read("src/lib/report/report-model.ts");
  assert.match(MODEL, /issue: issue === action/, "model guards against issue==action repetition");
});

check("CTA button has no trailing arrow glyph (PDF font-subset safe)", () => {
  const CTA = read("src/components/ReportCtaCard.tsx");
  assert.match(CTA, /Request My AI Visibility Foundation Fix/);
  assert.doesNotMatch(CTA, /Foundation Fix\s*→/, "the → arrow must be removed");
  assert.doesNotMatch(CTA, /→/, "no arrow glyph in the CTA card");
  assert.match(CTA, /implement the fixes identified in this audit/i, "CTA links to the audit");
});

check("uses provider logo marks", () => {
  const MARKS = read("src/components/report/BrandMarks.tsx");
  assert.match(MARKS, /export function ProviderMark/);
  for (const p of ["openai", "claude", "gemini", "perplexity"]) {
    assert.match(MARKS, new RegExp(`case "${p}"`), `missing mark for ${p}`);
  }
  assert.match(DOC, /<ProviderMark/);
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
