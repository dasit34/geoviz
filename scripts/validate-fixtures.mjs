/**
 * Validates all 6 fixture preview pages by fetching and inspecting the rendered HTML.
 * Reports: page count, rd-title values, rd-page structure, broken text patterns,
 * and any warning strings that must not appear in customer-facing PDFs.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { load } = require("cheerio");

const BASE = "http://localhost:3000";
const FIXTURES = [
  "perfect-audit",
  "average-audit",
  "broken-category-audit",
  "failed-model-audit",
  "missing-schema-audit",
  "missing-reviews-audit",
];

// Strings that must NEVER appear in customer-facing output
const FORBIDDEN = [
  // Raw API/model failure language
  "no response captured",
  "failed to load",
  "could not access",
  // Technical jargon that the normalizer and source fixes should eliminate
  "json-ld block",
  "json-ld schema",
  "localbusiness",
  "schema.org",
  "nap consistency",
  // Raw schema.org field identifiers (must appear humanized)
  " geo,",
  ":geo",
  "openinghours",
  // JavaScript runtime leaks
  "undefined",
  "[object",
  // Broken question templates
  "best and ",
  "best or ",
  "a reliable and",
  "and decor retailer",
  "or decor retailer",
];

// Pages we need to verify (by title text)
const REQUIRED_PAGE_TITLES = [
  "Executive Summary",
  "AI Intelligence",
  "Customer Questions Tested",
  "Top Issues",
];

async function validateFixture(name) {
  const url = `${BASE}/fixture-preview/${name}/print`;
  let html;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { name, ok: false, error: `HTTP ${res.status}` };
    }
    html = await res.text();
  } catch (e) {
    return { name, ok: false, error: String(e) };
  }

  const $ = load(html);
  const issues = [];
  const info = {};

  // Count pages
  const pages = $(".rd-page");
  info.pageCount = pages.length;
  if (pages.length !== 8) {
    issues.push(`Expected 8 rd-page elements, found ${pages.length}`);
  }

  // Extract page titles
  const titles = [];
  $(".rd-title").each((_, el) => titles.push($(el).text().trim()));
  info.pageTitles = titles;

  for (const required of REQUIRED_PAGE_TITLES) {
    if (!titles.includes(required)) {
      issues.push(`Missing page title: "${required}"`);
    }
  }

  // Extract all visible text (strip scripts/styles)
  $("script, style").remove();
  const fullText = $.root().text().replace(/\s+/g, " ").toLowerCase();

  // Check forbidden strings
  const foundForbidden = [];
  for (const pattern of FORBIDDEN) {
    const lower = pattern.toLowerCase();
    // "error" gets special treatment — only match as standalone word to avoid
    // false positives on words like "currently"
    const idx = lower === "error"
      ? fullText.search(/\berror\b/)
      : fullText.indexOf(lower);
    if (idx !== -1) {
      const snippet = fullText.slice(Math.max(0, idx - 20), idx + 60).trim();
      foundForbidden.push({ pattern, snippet });
    }
  }
  if (foundForbidden.length > 0) {
    for (const { pattern, snippet } of foundForbidden) {
      issues.push(`FORBIDDEN "${pattern}" found: ...${snippet}...`);
    }
  }

  // Check specific sections are non-empty
  // Executive Summary — stat cards (rd-stat-v = value span; rd-stat-k = label)
  const execStats = $(".rd-stat-v");
  info.execStatCount = execStats.length;
  if (execStats.length === 0) {
    issues.push("No rd-stat-v elements found (Executive stat cards missing)");
  } else {
    const statTexts = [];
    execStats.each((_, el) => statTexts.push($(el).text().trim()));
    info.statValues = statTexts.join(", ");
  }

  // Customer questions
  const questions = [];
  $(".rd-questions-item").each((_, el) => {
    questions.push($(el).text().trim());
  });
  info.questionCount = questions.length;
  info.sampleQuestions = questions.slice(0, 3);

  // AI provider rows
  const providerCells = [];
  $(".rd-matrix-model").each((_, el) => {
    providerCells.push($(el).text().trim());
  });
  info.providerRowCount = providerCells.length;
  info.providerNames = providerCells;

  // Top issues
  const issueTitles = [];
  $(".rd-issue-title").each((_, el) => issueTitles.push($(el).text().trim()));
  info.topIssueCount = issueTitles.length;
  info.issueTitles = issueTitles;

  // Score value — cover page
  const scoreEl = $(".rd-score-num");
  info.scoreText = scoreEl.first().text().trim().substring(0, 20);

  // Business name — cover
  const nameEl = $(".rd-cover-biz");
  info.businessName = nameEl.first().text().trim().substring(0, 60);

  return {
    name,
    ok: issues.length === 0,
    issues,
    info,
  };
}

async function main() {
  console.log("─".repeat(70));
  console.log("GeoViz Fixture Report Validation");
  console.log("─".repeat(70));

  let allOk = true;

  for (const fixture of FIXTURES) {
    const result = await validateFixture(fixture);
    const status = result.ok ? "✓ PASS" : "✗ FAIL";
    console.log(`\n${status}  ${result.name}`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
      allOk = false;
      continue;
    }

    const i = result.info;
    console.log(`  Business : ${i.businessName || "(not found)"}`);
    console.log(`  Score    : ${i.scoreText || "(not found)"}`);
    console.log(`  Pages    : ${i.pageCount}`);
    console.log(`  Titles   : ${i.pageTitles?.join(" | ")}`);
    console.log(`  Stat cards: ${i.execStatCount}`);
    console.log(`  Questions : ${i.questionCount}`);
    console.log(`  Providers : ${i.providerRowCount}`);
    console.log(`  Top issues: ${i.topIssueCount}`);

    if (result.issues.length > 0) {
      allOk = false;
      for (const issue of result.issues) {
        console.log(`  ⚠  ${issue}`);
      }
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(allOk ? "ALL FIXTURES PASS" : "FAILURES DETECTED — see above");
  console.log("─".repeat(70));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
