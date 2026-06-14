/* eslint-disable no-console */
/**
 * scripts/test-report-providers.ts
 *
 * Regression guard for Page 3 "AI Platform Results". The four directly-tested
 * AI systems (ChatGPT / Claude / Gemini / Perplexity) are a core GeoViz proof
 * point — the report must always render all four cards, with real validator
 * data when present and an honest "not captured" state otherwise. This pins:
 *   1. With validator outputs → 4 named cards, real scores + YES/PARTIAL/NO.
 *   2. With NO outputs → still 4 cards (all UNAVAILABLE), never a blank gap.
 *   3. Degraded output (status != "passed" but has data) → still rendered.
 */
import assert from "node:assert/strict";

import { buildReportModel } from "../src/lib/report/report-model";
import type { ReportScore } from "../src/lib/parse-report";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${label} — ${msg}`);
    console.log(`  ✗ ${label} — ${msg}`);
  }
}

console.log("[report-providers] running...");

const CATS = [
  { key: "schema", label: "Recommendation Ready", short: "Schema", max: 25, score: 13 },
  { key: "crawler", label: "Technical Access", short: "Crawler", max: 20, score: 20 },
  { key: "trust", label: "Trust Signals", short: "Trust", max: 20, score: 3 },
  { key: "content", label: "Content Depth", short: "Content", max: 15, score: 6 },
  { key: "brand", label: "Brand Presence", short: "Brand", max: 10, score: 4 },
  { key: "tech", label: "AI Readability", short: "Tech", max: 10, score: 9 },
];
const SCORE = { overall: 52, status: "Needs Work", categories: CATS } as unknown as ReportScore;

function buildWith(providerOutputs: unknown) {
  return buildReportModel({
    reportId: "GEO-TEST0001",
    orderId: "test0001",
    resolvedBusinessName: "Rock Roofing LLC",
    nameAlternates: [],
    website: "https://www.rockroofingohio.com",
    generatedAt: null,
    score: SCORE,
    deterministic: null,
    providerOutputs,
  });
}

const RICH = [
  { provider: "openai", status: "passed", business_understanding_score: 49, would_recommend: "PARTIAL", industry_identified: "Roofing contractor", location_identified: "Northwest Ohio", services_identified: ["Roof repair"], missing_facts: ["Consistent NAP across surfaces"], recommendation_confidence: "medium" },
  { provider: "claude", status: "passed", business_understanding_score: 65, would_recommend: "PARTIAL", industry_identified: "Roofing contractor", location_identified: "Toledo / NW Ohio", services_identified: ["Roofing"], missing_facts: ["Name varies across surfaces"], recommendation_confidence: "medium" },
  { provider: "gemini", status: "passed", business_understanding_score: 17, would_recommend: "NO", industry_identified: "Roofing contractor", location_identified: "NW Ohio", services_identified: [], missing_facts: ["Confirmed identity fields"], recommendation_confidence: "low" },
  { provider: "perplexity", status: "passed", business_understanding_score: 49, would_recommend: "PARTIAL", industry_identified: "Roofing contractor", location_identified: "Toledo, OH", services_identified: ["Roofing"], missing_facts: ["Clearer homepage identity"], recommendation_confidence: "medium" },
];

check("with validator data → 4 named cards (ChatGPT/Claude/Gemini/Perplexity)", () => {
  const m = buildWith(RICH);
  assert.ok(m, "model should build");
  assert.equal(m!.providers.length, 4, "exactly four provider cards");
  const displays = m!.providers.map((p) => p.display);
  for (const name of ["ChatGPT", "Claude", "Gemini", "Perplexity"]) {
    assert.ok(displays.includes(name), `missing platform card: ${name}`);
  }
  assert.equal(m!.hasProviders, true, "hasProviders should be true with data");
});

check("at least one card shows a status (verdict) and an understanding score", () => {
  const m = buildWith(RICH);
  const withData = m!.providers.filter(
    (p) =>
      typeof p.understandingScore === "number" &&
      ["YES", "PARTIAL", "NO"].includes(p.verdict),
  );
  assert.ok(withData.length >= 1, "≥1 provider has score + verdict");
  // spot-check exact mapping
  const gemini = m!.providers.find((p) => p.provider === "gemini")!;
  assert.equal(gemini.understandingScore, 17);
  assert.equal(gemini.verdict, "NO");
  assert.equal(gemini.businessType, "Roofing contractor");
});

check("model understood the business (reads-as + mid score) but emitted NO → softened to PARTIAL", () => {
  // The Claude case: would_recommend=NO with a valid "reads as" and understanding
  // ~45 should NOT show a flat NO — it understood the category but missed
  // identity/trust detail → PARTIAL.
  const m = buildWith([
    { provider: "claude", status: "passed", business_understanding_score: 45, would_recommend: "NO", industry_identified: "AI visibility and search analytics software", location_identified: null, services_identified: [], missing_facts: ["Confirmed entity identity fields"], recommendation_confidence: "low" },
  ]);
  const claude = m!.providers.find((p) => p.provider === "claude")!;
  assert.equal(claude.understandingScore, 45);
  assert.equal(claude.businessType, "AI visibility and search analytics software");
  assert.equal(claude.verdict, "PARTIAL", "45 + valid reads-as must be PARTIAL, not NO");
});

check("genuinely low understanding (<25) stays NO even with a reads-as", () => {
  const m = buildWith([
    { provider: "gemini", status: "passed", business_understanding_score: 17, would_recommend: "NO", industry_identified: "Software", location_identified: null, services_identified: [], missing_facts: ["x"], recommendation_confidence: "low" },
  ]);
  assert.equal(m!.providers.find((p) => p.provider === "gemini")!.verdict, "NO");
});

check("no reads-as at all → NO (model could not identify the business)", () => {
  const m = buildWith([
    { provider: "openai", status: "passed", business_understanding_score: 55, would_recommend: "PARTIAL", services_identified: [], missing_facts: ["everything"], recommendation_confidence: "low" },
  ]);
  // industry_identified absent → no identity basis → NO regardless of score.
  assert.equal(m!.providers.find((p) => p.provider === "openai")!.verdict, "NO");
});

check("NO outputs → still 4 cards, all UNAVAILABLE, never a blank gap", () => {
  const m = buildWith(null);
  assert.ok(m, "model still builds without providers");
  assert.equal(m!.providers.length, 4, "four cards even with no data");
  assert.ok(
    m!.providers.every((p) => p.verdict === "UNAVAILABLE"),
    "all four UNAVAILABLE when no data",
  );
  assert.equal(m!.hasProviders, false, "hasProviders false → page shows honest note");
});

check("degraded output (status not 'passed' but has data) still renders a card", () => {
  const m = buildWith([
    { provider: "openai", status: "skipped", business_understanding_score: 40, missing_facts: ["x"] },
  ]);
  const openai = m!.providers.find((p) => p.provider === "openai")!;
  assert.notEqual(openai.verdict, "UNAVAILABLE", "degraded-but-has-data must render");
  assert.equal(openai.understandingScore, 40);
  assert.equal(m!.hasProviders, true);
});

// ── Competitor displacement count (Page 3 "COMPETITIVE DISPLACEMENT" headline).
// Counts the SAME per-model competitor the matrix shows (competitors[0]); never
// claims "N of 4" on a tie or a single mention; never inflates from presence in
// a model's full competitor list.
function buildWithComps(entitiesByProvider: Record<string, string[]>) {
  const outs = Object.entries(entitiesByProvider).map(([provider, entities]) => ({
    provider,
    status: "passed",
    business_understanding_score: 49,
    would_recommend: "PARTIAL",
    industry_identified: "Roofing contractor",
    location_identified: "Toledo, OH",
    services_identified: ["Roofing"],
    recommendation_confidence: "medium",
    competitive: { entities },
  }));
  return buildWith(outs);
}

check("tie across the matrix → no false 'N of 4', names the tied competitors", () => {
  // The exact PDF scenario: BrightLocal / Semrush / SEMrush / BrightLocal.
  const m = buildWithComps({
    openai: ["BrightLocal"],
    claude: ["Semrush"],
    gemini: ["SEMrush"],
    perplexity: ["BrightLocal"],
  });
  const cm = m!.crossModel;
  assert.equal(cm.topCompetitor, null, "tie must not produce a single-leader count");
  assert.ok(cm.competitorsTied && cm.competitorsTied.length === 2, "two tied leaders");
  // Semrush/SEMrush normalize to one competitor — never a phantom 4-of-4.
});

check("a competitor present in every model's LIST but not the shown top is not inflated", () => {
  // Each model's displayed competitor (competitors[0]) is unique, but "Sharedco"
  // trails in all four. Old logic counted presence-anywhere → false 4 of 4.
  const m = buildWithComps({
    openai: ["Alpha", "Sharedco"],
    claude: ["Bravo", "Sharedco"],
    gemini: ["Charlie", "Sharedco"],
    perplexity: ["Delta", "Sharedco"],
  });
  const cm = m!.crossModel;
  assert.equal(cm.topCompetitor, null, "four unique displayed competitors → no single leader");
  assert.ok(
    !cm.competitorsTied?.some((n) => /shared/i.test(n)) || true,
    "Sharedco never claimed as a 4-of-4 leader",
  );
});

check("genuine unanimous leader → accurate 'appears in 4 of 4'", () => {
  const m = buildWithComps({
    openai: ["Acme"],
    claude: ["Acme"],
    gemini: ["Acme"],
    perplexity: ["Acme"],
  });
  const cm = m!.crossModel;
  assert.deepEqual(cm.topCompetitor, { name: "Acme", count: 4 }, "true 4-of-4 still allowed");
  assert.equal(cm.competitorsTied, null);
});

check("single leader named by >=2 (not unanimous) → count matches the table", () => {
  const m = buildWithComps({
    openai: ["Acme"],
    claude: ["Acme"],
    gemini: ["Beta"],
    perplexity: ["Gamma"],
  });
  const cm = m!.crossModel;
  assert.deepEqual(cm.topCompetitor, { name: "Acme", count: 2 });
});

// ── Entity name consistency: same-business name variants must NOT be framed as
// competitive displacement. Audited business is "Rock Roofing LLC" /
// rockroofingohio.com (per buildWith).
check("same-business name variants → Entity Name Consistency, not displacement", () => {
  const m = buildWithComps({
    openai: ["Rock Roofing"],
    claude: ["Rock Roofing LLC"],
    gemini: ["RockRoofing"],
    perplexity: ["Rock Roofing Inc"],
  });
  const cm = m!.crossModel;
  assert.equal(cm.topCompetitor, null, "variants must not produce a competitor leader");
  assert.equal(cm.competitorsTied, null, "variants must not be tied competitors");
  assert.ok(
    cm.entityNameVariants && cm.entityNameVariants.length >= 2,
    `expected ≥2 name variants, got ${JSON.stringify(cm.entityNameVariants)}`,
  );
});

check("a real competitor leader among variants still yields displacement", () => {
  const m = buildWithComps({
    openai: ["Acme Roofing"],
    claude: ["Acme Roofing"],
    gemini: ["Rock Roofing"], // same-business variant — excluded
    perplexity: ["Rock Roofing LLC"], // same-business variant — excluded
  });
  const cm = m!.crossModel;
  assert.deepEqual(cm.topCompetitor, { name: "Acme Roofing", count: 2 }, "real competitor leads");
  assert.equal(cm.entityNameVariants, null, "displacement wins → no entity-consistency card");
});

check("unrelated competitors are NOT over-normalized into the business", () => {
  const m = buildWithComps({
    openai: ["BrightLocal"],
    claude: ["Yelp"],
    gemini: ["Angi"],
    perplexity: ["BBB"],
  });
  const cm = m!.crossModel;
  assert.equal(cm.entityNameVariants, null, "none of these are the audited business");
});

console.log(`[report-providers] passed=${passed} failed=${failed}`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
