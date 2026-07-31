/* eslint-disable no-console */
/**
 * scripts/validate-report-fixtures.ts
 *
 * Production gate: ensures no forbidden strings appear in GeoViz reports.
 *
 * MODE A — build-time fixture check (default, no DB or network required):
 *   npx tsx scripts/validate-report-fixtures.ts
 *
 * MODE B — live production check (requires env vars ADMIN_SECRET + APP_URL):
 *   npx tsx scripts/validate-report-fixtures.ts --live
 *
 * Exits non-zero if ANY pattern matches ANY report.
 * Used as: "report:validate" in package.json (wired into build).
 */
import "dotenv/config";
import assert from "node:assert/strict";

// ── Forbidden patterns ─────────────────────────────────────────────────────
// Single canonical list — mirrors FORBIDDEN_QA in recover-batch/route.ts and
// ReportQaPage.tsx but extended with the full production gate requirements.

const PRODUCTION_GATE: Array<[RegExp, string]> = [
  // --- Existing QA patterns (from recover-batch/route.ts) ---
  [/json-?ld\s+block/i, "json-ld block jargon"],
  [/\blocalbusiness\b/i, "LocalBusiness jargon"],
  [/\bnap\s+consistency\b/i, "NAP consistency jargon"],
  [/no response captured/i, "internal error string"],
  [/fields?\s+missing:.*\bgeo\b/i, "raw field 'geo'"],
  [/fields?\s+missing:.*\bopeninghours\b/i, "raw field 'openingHours'"],
  [/\bundefined\b/, "literal 'undefined'"],
  [/\[object\s*Object\]/i, "[object Object]"],
  [/best and /i, "broken question template"],
  [/best or /i, "broken question template"],
  // --- Production gate additions ---
  [/\[CAL\]/i, "[CAL] calibration label leak"],
  [/\bNaN\b/, "NaN value leak"],
  [/\bTODO\b/, "TODO comment leak"],
  [/\bFIXME\b/, "FIXME comment leak"],
  // Match literal "null" and "undefined" as standalone words in prose;
  // these indicate template variables that were not populated.
  [/\bnull\b/, "literal 'null' leak"],
  [/defaulting to low/i, "defaulting-to-low fallback leak"],
  [/\b0\s+homepage\s+words?\b/i, "0 homepage words"],
  [/\b0\s+words?\s+(?:detected|found|extracted)\b/i, "0 words extracted"],
  [/Industry benchmark forming/i, "'benchmark forming' copy (should be replaced)"],
  // Nonprofit benchmark — target customers are never nonprofits.
  // Any "nonprofit audits" or "nonprofit peers" in a customer report
  // means a wrong-cohort benchmark was applied.
  [/nonprofit\s+audits?/i, "nonprofit benchmark on non-nonprofit report"],
  [/nonprofit\s+peers?/i, "nonprofit peer benchmark leak"],
  // Customer-question grammar guards — catch a business-type noun getting
  // pluralized twice ("business" + "es" + "es" = "businesseses").
  [/businesseses/i, "double-pluralized 'businesseses'"],
  [/\b\w+(?:s|sh|ch|x|z)eses\b/i, "duplicate plural suffix (e.g. 'businesseses')"],
];

// ── Fixtures mode ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function checkText(
  text: string,
  label: string,
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const [pattern, description] of PRODUCTION_GATE) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      failures.push(`  [${description}] matched: "${match?.[0] ?? "?"}"`);
    }
  }
  if (failures.length > 0) {
    console.error(`\n✗ FAIL: ${label}`);
    failures.forEach((f) => console.error(f));
  } else {
    console.log(`  ✓ PASS: ${label}`);
  }
  return { pass: failures.length === 0, failures };
}

async function runFixtureMode(): Promise<boolean> {
  console.log("═══════════════════════════════════════════");
  console.log("GeoViz Report Fixture Validation");
  console.log("Mode: build-time fixture check");
  console.log("═══════════════════════════════════════════\n");

  // Dynamic imports — avoid loading Next.js runtime at module level.
  const { PERFECT_AUDIT_INPUT } = await import(
    "../src/lib/report/__tests__/snapshots/perfect-audit"
  );
  const { AVERAGE_AUDIT_INPUT } = await import(
    "../src/lib/report/__tests__/snapshots/average-audit"
  );
  const { BROKEN_CATEGORY_AUDIT_INPUT } = await import(
    "../src/lib/report/__tests__/snapshots/broken-category-audit"
  );
  const { FAILED_MODEL_AUDIT_INPUT } = await import(
    "../src/lib/report/__tests__/snapshots/failed-model-audit"
  );
  const { MISSING_SCHEMA_AUDIT_INPUT } = await import(
    "../src/lib/report/__tests__/snapshots/missing-schema-audit"
  );
  const { MISSING_REVIEWS_AUDIT_INPUT } = await import(
    "../src/lib/report/__tests__/snapshots/missing-reviews-audit"
  );
  const { RECOMMENDATION_READINESS_CONTRADICTION_INPUT } = await import(
    "../src/lib/report/__tests__/snapshots/recommendation-readiness-contradiction"
  );
  const { buildReportModel } = await import("../src/lib/report/report-model");
  const { normalizeReportModel } = await import(
    "../src/lib/report/reportDataNormalizer"
  );

  const fixtures = [
    { name: "perfect-audit", input: PERFECT_AUDIT_INPUT },
    { name: "average-audit", input: AVERAGE_AUDIT_INPUT },
    { name: "broken-category-audit", input: BROKEN_CATEGORY_AUDIT_INPUT },
    { name: "failed-model-audit", input: FAILED_MODEL_AUDIT_INPUT },
    { name: "missing-schema-audit", input: MISSING_SCHEMA_AUDIT_INPUT },
    { name: "missing-reviews-audit", input: MISSING_REVIEWS_AUDIT_INPUT },
    {
      name: "recommendation-readiness-contradiction",
      input: RECOMMENDATION_READINESS_CONTRADICTION_INPUT,
    },
  ];

  console.log(`Checking ${fixtures.length} fixture reports...\n`);

  let allPass = true;
  for (const { name, input } of fixtures) {
    // Check the raw markdown (the primary source of prose text) — a no-op
    // for BuildReportModelInput-shaped fixtures, which carry no
    // `reportMarkdown` field, but kept for any fixture that does.
    const md = (input as { reportMarkdown?: string | null }).reportMarkdown ?? "";
    const result = checkText(md, `fixture:${name} (reportMarkdown)`);
    if (!result.pass) allPass = false;

    // Also check the actual rendered customer-facing strings, built the
    // same way the live report is (buildReportModel → normalizeReportModel).
    // This is what actually catches template/mapping bugs (e.g. malformed
    // generated questions) since these fixtures have no reportMarkdown.
    const rawModel = buildReportModel(input);
    if (rawModel) {
      const model = normalizeReportModel(rawModel);
      const rendered = [
        model.executive.headline,
        ...model.executive.summaryBullets,
        model.executive.weakestSignal,
        model.executive.strongestSignal,
        ...model.customerQuestions,
        ...model.diagnostics.flatMap((d) => [d.title, d.problem, d.whyItHurts]),
        ...model.fixes.flatMap((f) => [f.issue, f.title, f.action, f.businessImpact]),
      ].join(" \n ");
      const renderedResult = checkText(rendered, `fixture:${name} (rendered model)`);
      if (!renderedResult.pass) allPass = false;
    }
  }

  console.log("\n═══════════════════════════════════════════");
  if (allPass) {
    console.log("✓ All fixture reports passed the production gate.");
  } else {
    console.error("✗ One or more fixture reports FAILED. Fix the template before building.");
  }
  console.log("═══════════════════════════════════════════\n");
  return allPass;
}

// ── Live production mode ───────────────────────────────────────────────────

async function runLiveMode(): Promise<boolean> {
  const adminSecret = process.env.ADMIN_SECRET;
  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  if (!adminSecret) {
    console.error(
      "✗ ADMIN_SECRET is not set. Cannot run live production gate.\n" +
        "  Set ADMIN_SECRET in your .env file and retry.\n",
    );
    return false;
  }

  console.log("═══════════════════════════════════════════");
  console.log("GeoViz Report Production Gate");
  console.log("Mode: live report check");
  console.log(`Target: ${appUrl}`);
  console.log("═══════════════════════════════════════════\n");
  console.log("Fetching calibration batch...\n");

  // 1. Fetch the calibration batch
  const batchRes = await fetch(
    `${appUrl}/api/internal/recover-batch?key=${adminSecret}`,
    { headers: { "x-admin-secret": adminSecret } },
  );

  if (!batchRes.ok) {
    console.error(`✗ Failed to fetch batch: HTTP ${batchRes.status}`);
    return false;
  }

  const batchData = (await batchRes.json()) as {
    results?: Array<{
      orderId: string;
      url: string;
      status: string;
      businessName?: string | null;
    }>;
    error?: string;
  };

  if (batchData.error) {
    console.error(`✗ Batch API error: ${batchData.error}`);
    return false;
  }

  const results = batchData.results ?? [];
  const generated = results.filter((r) => r.status === "generated");

  console.log(`Found ${results.length} total, ${generated.length} generated.\n`);

  if (generated.length === 0) {
    console.log("⚠ No generated reports to check.");
    return true;
  }

  // 2. Fetch and check each report's rendered HTML
  let allPass = true;
  let checked = 0;

  for (const report of generated) {
    const printUrl = `${appUrl}/report/${report.orderId}/print`;
    let html = "";

    try {
      const res = await fetch(printUrl, {
        headers: { "x-admin-secret": adminSecret },
      });
      if (!res.ok) {
        console.error(`  ✗ SKIP: ${report.url} — HTTP ${res.status} fetching ${printUrl}`);
        allPass = false;
        continue;
      }
      html = await res.text();
    } catch (e) {
      console.error(`  ✗ SKIP: ${report.url} — fetch error: ${String(e)}`);
      allPass = false;
      continue;
    }

    // Strip HTML tags so patterns don't match attribute values or tag names.
    const visibleText = stripHtml(html);
    const label = `${report.url} (${report.orderId.slice(0, 8)}…)`;
    const result = checkText(visibleText, label);
    if (!result.pass) allPass = false;
    checked++;
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(`Checked ${checked} / ${generated.length} generated reports.`);
  if (allPass) {
    console.log("✓ All live reports passed the production gate.");
    console.log("  Safe to push to main.");
  } else {
    console.error("✗ One or more live reports FAILED.");
    console.error("  Fix the template, regen HTML/PDFs, and retry.");
  }
  console.log("═══════════════════════════════════════════\n");
  return allPass;
}

// ── Entry point ────────────────────────────────────────────────────────────

const isLiveMode = process.argv.includes("--live");

(isLiveMode ? runLiveMode() : runFixtureMode()).then((pass) => {
  process.exit(pass ? 0 : 1);
}).catch((err: unknown) => {
  console.error("✗ Validation script threw unexpectedly:", err);
  process.exit(1);
});
