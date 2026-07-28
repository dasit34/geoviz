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
    "AIIntelligencePage",
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
    "AI Intelligence",
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
  assert.match(DOC, /ReadinessGrid/);
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

check("cover primary gap uses the issue title, not the raw-evidence problem string", () => {
  // The cover 'gap' must read diagnostics[0]?.title (customer-facing) and never
  // diagnostics[0]?.problem (which can fall back to a raw evidence reason like
  // "Detected 2 JSON-LD block(s)").
  assert.match(DOC, /const gap =\s*\n\s*m\.diagnostics\[0\]\?\.title/);
  assert.doesNotMatch(DOC, /const gap =\s*\n\s*m\.diagnostics\[0\]\?\.problem/);
});

check("cover review label is conditional on real review flag, not hardcoded", () => {
  // "Human Reviewed" must be gated on m.meta.reviewed; the unreviewed branch
  // reads "Automated Audit". No standalone hardcoded "Human Reviewed" value.
  assert.match(DOC, /m\.meta\.reviewed \? "Human Reviewed" : "Automated Audit"/);
  assert.match(DOC, /m\.meta\.reviewed \? "Human reviewed" : "Audit complete"/);
  assert.doesNotMatch(DOC, /v="Human Reviewed"/, "cover must not hardcode the review label");
  assert.doesNotMatch(DOC, /note="Human reviewed"/, "exec stat must not hardcode the review note");
});

check("Page 5 renders the conditional score note when present", () => {
  assert.match(DOC, /m\.scoreNote \?/);
  assert.match(DOC, /rd-interp-note/);
});

check("Page 4 renders Customer Questions Tested from the model (not 'prompts')", () => {
  assert.match(DOC, /Customer Questions Tested/);
  assert.match(DOC, /m\.customerQuestions/);
  assert.doesNotMatch(DOC, /\bprompts?\b/i, "customer copy must not use the word 'prompt(s)'");
  // Evidence subtitle surfaced (rendered as an all-caps eyebrow label)
  assert.match(DOC, /WHAT AI HAD TO READ/i);
});

check("light/dark page system: dark bookends fixed, light interior flows", () => {
  // Page variant is applied via <Page variant="dark|light"> → rd-page-${variant}.
  assert.match(DOC, /variant="dark"/);
  assert.match(DOC, /variant="light"/);
  assert.match(DOC, /rd-page-\$\{variant\}/);
  const CSS = read("src/components/report/report-document.css");
  assert.match(CSS, /\.rd-page-light/);
  assert.match(CSS, /\.rd-page-dark/);

  // Dark bookends (Cover, ActionPage) stay fixed full-bleed sheets that
  // always start a fresh page. Light interior sections must NOT force a
  // page break or a fixed height — they flow, so short sections can
  // share a physical page instead of leaving a blank one.
  //
  // Scope the search to the actual @media print RULE (not just the string
  // "@media print", which also appears in the file's header comment):
  // .rd-page-dark / .rd-page-light are ALSO defined earlier for screen
  // (background/color only) — matching the first occurrence in the whole
  // file would grab that screen rule instead of the print one.
  const printRuleMatch = CSS.match(/@media print\s*\{/);
  assert.ok(printRuleMatch, "@media print rule not found");
  const printCss = CSS.slice(printRuleMatch.index);
  const darkBlock = printCss.match(/\.rd-page-dark\s*\{([^}]*)\}/);
  const lightBlock = printCss.match(/\.rd-page-light\s*\{([^}]*)\}/);
  assert.ok(darkBlock, ".rd-page-dark print rule block not found");
  assert.ok(lightBlock, ".rd-page-light print rule block not found");
  assert.match(darkBlock[1], /break-before:\s*page/, "dark bookends must force a fresh sheet");
  assert.match(darkBlock[1], /min-height:\s*var\(--rd-page-height\)/, "dark bookends must stay full-bleed sheets");
  assert.doesNotMatch(lightBlock[1], /break-before:\s*page\b/, "light interior sections must not force a page break");
  assert.doesNotMatch(lightBlock[1], /min-height/, "light interior sections must not be forced to a fixed sheet height");

  // Section headers must stay glued to their content — no orphaned headings.
  assert.match(
    CSS,
    /\.rd-head,\s*\.rd-title\s*\{[^}]*break-after:\s*avoid/,
    "section headers must not be strandable alone at a page bottom",
  );

  // orphans/widows guard against a lone wrapped line being left alone at
  // the top/bottom of a page. Both properties inherit, so setting them on
  // .rd (print) covers every paragraph in the document.
  const rdPrintBlock = printCss.match(/\.rd\s*\{([^}]*)\}/);
  assert.ok(rdPrintBlock, ".rd print rule block not found");
  assert.match(rdPrintBlock[1], /orphans:\s*\d/, "orphans must be set on .rd in print");
  assert.match(rdPrintBlock[1], /widows:\s*\d/, "widows must be set on .rd in print");

  // List rows that can wrap to 2 lines (Executive Summary bullets,
  // Customer Questions Tested) must not split mid-item across a page
  // boundary, same protection every card class already has.
  assert.match(
    CSS,
    /\.rd-exec-item,\s*\.rd-questions-item\s*\{\s*break-inside:\s*avoid/,
    "list rows must not split mid-item across a page boundary",
  );
});

check("Evidence Reviewed page renders inspected signals from preflight", () => {
  assert.match(DOC, /m\.evidence\.map/);
  assert.match(DOC, /EvidenceRow/);
  const MODEL = read("src/lib/report/report-model.ts");
  assert.match(MODEL, /function buildEvidence/);
  assert.match(MODEL, /preflightSignals/);
});

check("model matrix shows verdict + understanding + confidence + names-you + sources", () => {
  // P3 consolidated into one dense matrix (one row per model) — replaces the
  // two prior card grids. Assert the matrix + its per-model columns.
  assert.match(DOC, /ModelMatrixRow/);
  assert.match(DOC, /rd-matrix/);
  assert.match(DOC, /Understands/);
  assert.match(DOC, /Names you/);
  assert.match(DOC, /Top entity named/);
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
