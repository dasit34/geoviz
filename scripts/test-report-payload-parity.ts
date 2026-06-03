/* eslint-disable no-console */
/**
 * scripts/test-report-payload-parity.ts
 *
 * Phase 1 launch guard — extends the score-only parity check
 * (test-score-source-parity.ts) to the WHOLE canonical report payload.
 *
 * Background: pre-Phase-D the admin queue rendered a parallel
 * re-implementation (`ReportViewerClient`) that omitted the
 * percentile / confidence / four-model / consensus surfaces, so an
 * operator approving a report did NOT see what the customer's PDF
 * showed. Phase D collapsed both surfaces onto ONE builder
 * (`buildReportContext`) + ONE name resolver (`resolveBusinessName`)
 * + ONE score resolver (`getCanonicalScore`), both fed from the SAME
 * Prisma `select`.
 *
 * This test pins that convergence so a future refactor can't silently
 * re-diverge the two surfaces:
 *
 *   1. resolveBusinessName is pure → identical input yields a
 *      byte-identical resolution regardless of which surface calls it.
 *   2. getCanonicalScore parity across the admin / PDF / email call
 *      shape (same intelligence → same overall).
 *   3. SOURCE WIRING: both `admin/reports/page.tsx` and
 *      `report/[id]/print/page.tsx` import + call buildReportContext
 *      AND resolveBusinessName, and select the SAME 11 intelligence
 *      fields buildReportContext reads. A field present in one select
 *      but not the other would silently null part of the context on
 *      one surface only — the exact divergence class this guards.
 *
 * Hermetic: does NOT invoke buildReportContext (it queries the
 * percentile DB). It asserts the WIRING is symmetric instead, which is
 * where the divergence risk actually lives — the builder itself is a
 * single shared function and can't diverge from itself.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveBusinessName } from "../src/lib/intelligence/resolve-business-name";
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

console.log("[report-payload-parity] running...");

// ── 1. resolveBusinessName parity (pure-function determinism) ───────
// A preflight payload whose schema name disagrees with the order input
// — the resolver must pick schema AND flag the inconsistency, and must
// do so identically no matter who calls it.
const PREFLIGHT_WITH_SCHEMA = {
  ok: true,
  engineVersion: "v1",
  runDurationMs: 10,
  fetchedUrl: "https://independencerealtygroup.com",
  fetchOk: true,
  readability: null,
  schema: null,
  crawlability: null,
  entityConsistency: {
    score: 80,
    extractedEntities: {
      name: {
        schema: "Independence Realty Group",
        homepage: "Independence Realty Group",
        footer: null,
      },
      phone: { schema: null, homepage: null, footer: null },
      address: { schema: null, homepage: null, footer: null },
    },
    inconsistencies: [],
    confidence: 0.9,
  },
};

const order = {
  businessName: "RG Ohio",
  email: "owner@independencerealtygroup.com",
  websiteUrl: "https://independencerealtygroup.com",
};

// Two independent call sites (admin + PDF) constructing the resolver
// input from the same persisted data.
const adminResolution = resolveBusinessName({
  intelligence: { preflightSignals: PREFLIGHT_WITH_SCHEMA },
  order,
});
const pdfResolution = resolveBusinessName({
  intelligence: { preflightSignals: PREFLIGHT_WITH_SCHEMA },
  order,
});

check(
  "resolveBusinessName picks the authoritative schema name",
  adminResolution.name === "Independence Realty Group" &&
    adminResolution.source === "schema",
  `got name="${adminResolution.name}" source="${adminResolution.source}"`,
);
check(
  "resolveBusinessName flags the order-input inconsistency",
  adminResolution.inconsistency?.primary === "Independence Realty Group" &&
    adminResolution.inconsistency?.alternates.join(",") === "RG Ohio",
  `got ${JSON.stringify(adminResolution.inconsistency)}`,
);
check(
  "Admin and PDF resolve the SAME name payload (parity)",
  JSON.stringify(adminResolution) === JSON.stringify(pdfResolution),
  `admin=${JSON.stringify(adminResolution)} pdf=${JSON.stringify(pdfResolution)}`,
);

// ── 2. getCanonicalScore parity across surfaces ─────────────────────
const DETERMINISTIC_FIXTURE = {
  scoring_version: "scoring@1.0.0",
  overall_score: 43,
  band: "At Risk",
  category_scores: {
    schema: { score: 4, max: 25 },
    crawler: { score: 18, max: 20 },
    trust: { score: 2, max: 20 },
    content: { score: 8, max: 15 },
    brand: { score: 2, max: 10 },
    tech: { score: 9, max: 10 },
  },
  synergy_bonus_applied: 0,
  confidence_level: "moderate",
  top_3_findings: [],
};

const pdfScore = getCanonicalScore({
  reportMarkdown: null,
  intelligence: { deterministicScore: DETERMINISTIC_FIXTURE },
});
const adminScore = getCanonicalScore({
  reportMarkdown: null,
  intelligence: { deterministicScore: DETERMINISTIC_FIXTURE },
});
check(
  "getCanonicalScore returns the same overall on both surfaces",
  pdfScore.overall === 43 && adminScore.overall === pdfScore.overall,
  `admin=${adminScore.overall} pdf=${pdfScore.overall}`,
);
check(
  "getCanonicalScore returns the same six categories on both surfaces",
  JSON.stringify(adminScore.categories) ===
    JSON.stringify(pdfScore.categories),
  "category arrays diverged",
);

// ── 3. Source-wiring guards ─────────────────────────────────────────
const printPage = readFileSync(
  join(REPO_ROOT, "src/app/report/[id]/print/page.tsx"),
  "utf8",
);
const adminPage = readFileSync(
  join(REPO_ROOT, "src/app/admin/reports/page.tsx"),
  "utf8",
);

// The 11 fields ReportContextIntelligenceInput reads. Both Prisma
// selects must include every one — a field present in one but not the
// other nulls part of the customer context on a single surface.
const REQUIRED_SELECT_FIELDS = [
  "deterministicScore",
  "industryCategoryNormalized",
  "overallScore",
  "semanticClarityScore",
  "crawlerAccessibilityScore",
  "trustSignalScore",
  "structuredIdentityScore",
  "recommendationReadinessScore",
  "aiValidations",
  "consensusIndex",
  "preflightSignals",
];

for (const field of REQUIRED_SELECT_FIELDS) {
  const re = new RegExp(`${field}:\\s*true`);
  const inPrint = re.test(printPage);
  const inAdmin = re.test(adminPage);
  check(
    `select parity: \`${field}\` selected on both surfaces`,
    inPrint && inAdmin,
    `print=${inPrint} admin=${inAdmin}`,
  );
}

check(
  "PDF route imports + calls buildReportContext",
  /import\s*\{\s*buildReportContext\s*\}/.test(printPage) &&
    /buildReportContext\(/.test(printPage),
);
check(
  "Admin page imports + calls buildReportContext",
  /import\s*\{\s*buildReportContext\s*\}/.test(adminPage) &&
    /buildReportContext\(/.test(adminPage),
);
check(
  "PDF route imports + calls resolveBusinessName",
  /import\s*\{\s*resolveBusinessName\s*\}/.test(printPage) &&
    /resolveBusinessName\(/.test(printPage),
);
// Admin resolves the name inside AdminReportCard (client), so the
// import lives there, not the server page.
const adminCard = readFileSync(
  join(REPO_ROOT, "src/components/AdminReportCard.tsx"),
  "utf8",
);
check(
  "Admin surface resolves the business name via resolveBusinessName",
  /resolveBusinessName\(/.test(adminCard),
);

if (failed > 0) {
  console.log(
    `[report-payload-parity] FAILED — passed=${passed} failed=${failed}`,
  );
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[report-payload-parity] passed=${passed} failed=0`);
