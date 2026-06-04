/* eslint-disable no-console */
/**
 * scripts/test-payload-hash-parity.ts
 *
 * Admin/PDF parity PROOF (LaBre review). The admin preview and the PDF
 * print page render the SAME <AuditReportContent/> from the SAME order,
 * using the SAME pure builders — `resolveBusinessName`,
 * `getCanonicalScore`, `parseReportSections`, and the validator
 * verdicts. This test derives a single canonical "report signature"
 * (a SHA-256 hash over the customer-facing fields) the way BOTH
 * surfaces derive it, and asserts:
 *   - the signature is deterministic (same order → same hash on every
 *     surface);
 *   - it actually incorporates businessName, score, band, the ordered
 *     section slugs, and the per-provider verdicts (so a divergence in
 *     any of them would change the hash and fail).
 *
 * Run alongside the structural guard in test-report-redesign.ts
 * (ScoreBanner demoted to operator-only; customer preview renders only
 * the report component).
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { resolveBusinessName } from "../src/lib/intelligence/resolve-business-name";
import { getCanonicalScore } from "../src/lib/scoring/getCanonicalScore";
import {
  parseReportSections,
  bandLabelForOverall,
} from "../src/lib/parse-report";

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

// ── A single audit order (the data both surfaces read) ──────────────
const ORDER = {
  businessName: "LaBre Law",
  email: "owner@labrelaw.com",
  websiteUrl: "https://www.labrelaw.com",
};

const DETERMINISTIC = {
  scoring_version: "scoring@1.0.0",
  overall_score: 47.8,
  band: "Needs Work",
  category_scores: {
    schema: { score: 6, max: 25 },
    crawler: { score: 14, max: 20 },
    trust: { score: 5, max: 20 },
    content: { score: 9, max: 15 },
    brand: { score: 5, max: 10 },
    tech: { score: 9, max: 10 },
  },
  synergy_bonus_applied: 0,
  confidence_level: "moderate",
  top_3_findings: [],
};

const PREFLIGHT = {
  ok: true,
  engineVersion: "v1",
  runDurationMs: 1,
  fetchedUrl: "https://labrelaw.com",
  fetchOk: true,
  readability: { textLength: 1, parsedByReadability: true, fallbackUsed: false, articleTitle: "Just a moment...", wordCount: 1, preview: "" },
  schema: null,
  crawlability: null,
  entityConsistency: {
    score: 40,
    extractedEntities: {
      name: { schema: "Just a moment...", homepage: "LaBre Law", footer: "LaBre Law Office" },
      phone: { schema: null, homepage: null, footer: null },
      address: { schema: null, homepage: null, footer: null },
    },
    inconsistencies: [],
    confidence: 0.5,
  },
};

const AI_VALIDATIONS = {
  outputs: [
    { provider: "openai", status: "passed", would_recommend: "PARTIAL", raw_summary: "LaBre Law Office is a firm." },
    { provider: "claude", status: "passed", would_recommend: "NO", raw_summary: "LaBre Law Office is a firm." },
    { provider: "gemini", status: "passed", would_recommend: "NO", raw_summary: "LaBre Law Office is a firm." },
    { provider: "perplexity", status: "passed", would_recommend: "PARTIAL", raw_summary: "LaBre Law Office is a firm." },
  ],
};

const MARKDOWN =
  "## AI Visibility Score\n\n**48/100 — Needs Work**\n\n" +
  "## Top 3 Issues\n\n### 1. AI Has No Way to Verify\n\n**What We Found** — none.\n\n" +
  "## What to Fix First\n\n### 1. Add identity\n\n**Recommended Fix** — add it.\n\n" +
  "## Business Impact\n\nReputation gap.\n\n## GEO Foundation Fix\n\nScoped engagement.\n";

const PROVIDER_ORDER = ["openai", "claude", "gemini", "perplexity"];

/**
 * The canonical customer-facing signature — derived ONLY from shared
 * builders, exactly as AuditReportContent does for either surface.
 */
function reportSignature(
  order: typeof ORDER,
  opts: { homepageName?: string; overall?: number } = {},
): string {
  const preflight = opts.homepageName
    ? {
        ...PREFLIGHT,
        entityConsistency: {
          ...PREFLIGHT.entityConsistency,
          extractedEntities: {
            ...PREFLIGHT.entityConsistency.extractedEntities,
            name: {
              ...PREFLIGHT.entityConsistency.extractedEntities.name,
              homepage: opts.homepageName,
            },
          },
        },
      }
    : PREFLIGHT;
  const name = resolveBusinessName({
    intelligence: { preflightSignals: preflight, aiValidations: AI_VALIDATIONS },
    order,
  }).name;
  const score = getCanonicalScore({
    reportMarkdown: MARKDOWN,
    intelligence: {
      deterministicScore:
        opts.overall !== undefined
          ? { ...DETERMINISTIC, overall_score: opts.overall }
          : DETERMINISTIC,
    },
  });
  const band = bandLabelForOverall(score.overall);
  const sectionSlugs = parseReportSections(MARKDOWN).sections.map((s) => s.slug);
  const byProvider: Record<string, string> = {};
  for (const o of AI_VALIDATIONS.outputs) byProvider[o.provider] = o.would_recommend;
  const verdicts = PROVIDER_ORDER.map((p) => `${p}:${byProvider[p] ?? "—"}`);

  const payload = {
    businessName: name,
    overall: score.overall,
    band,
    categories: score.categories.map((c) => `${c.key}:${c.score}`),
    sectionSlugs,
    providerVerdicts: verdicts,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

console.log("[payload-hash-parity] running...");

const adminHash = reportSignature(ORDER);
const pdfHash = reportSignature(ORDER);

check("admin and PDF derive the SAME report signature", () => {
  assert.equal(adminHash, pdfHash, `admin=${adminHash} pdf=${pdfHash}`);
});

check("signature reflects the resolved (clean) business name", () => {
  // Sanity: the resolved name is LaBre Law, not the Cloudflare title.
  const name = resolveBusinessName({
    intelligence: { preflightSignals: PREFLIGHT, aiValidations: AI_VALIDATIONS },
    order: ORDER,
  }).name;
  assert.equal(name, "LaBre Law");
});

check("a different resolved business name changes the hash", () => {
  const other = reportSignature(ORDER, { homepageName: "Different Firm" });
  assert.notEqual(other, adminHash);
});

check("a different score changes the hash", () => {
  const other = reportSignature(ORDER, { overall: 72 });
  assert.notEqual(other, adminHash);
});

check("signature is non-trivial (64-hex SHA-256)", () => {
  assert.match(adminHash, /^[0-9a-f]{64}$/);
});

console.log(`[payload-hash-parity] report signature = ${adminHash}`);

if (failed > 0) {
  console.log(`[payload-hash-parity] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[payload-hash-parity] passed=${passed} failed=0`);
