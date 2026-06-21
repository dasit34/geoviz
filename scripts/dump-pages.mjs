/**
 * Dumps the rendered text content of the 4 target pages for each fixture.
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

const TARGETS = [
  { label: "EXECUTIVE SUMMARY (P2)", index: 1 },
  { label: "AI INTELLIGENCE (P3)", index: 2 },
  { label: "CUSTOMER QUESTIONS (P4)", index: 3 },
  { label: "TOP ISSUES (P6)", index: 5 },
];

async function dumpFixture(name) {
  const res = await fetch(`${BASE}/fixture-preview/${name}/print`);
  const html = await res.text();
  const $ = load(html);
  $("script, style").remove();
  const pages = $(".rd-page");

  console.log("\n" + "═".repeat(70));
  console.log(`FIXTURE: ${name.toUpperCase()}`);
  console.log("═".repeat(70));

  const biz = $(".rd-cover-biz").first().text().trim();
  const score = $(".rd-score-num").first().text().trim();
  const band = $(".rd-band").first().text().trim() || $(".rd-cover-band").first().text().trim();
  console.log(`Business: ${biz}  |  Score: ${score}  |  Band: ${band}`);

  for (const target of TARGETS) {
    const page = $(pages[target.index]);
    if (!page.length) {
      console.log(`\n── ${target.label}: [NOT FOUND]`);
      continue;
    }
    const text = page.text().replace(/\s+/g, " ").trim();
    console.log(`\n── ${target.label}`);
    // Print in 100-char chunks for readability
    const CHUNK = 200;
    for (let i = 0; i < Math.min(text.length, 1800); i += CHUNK) {
      console.log("   " + text.slice(i, i + CHUNK));
    }
    if (text.length > 1800) console.log("   [...]");
  }
}

async function main() {
  for (const fixture of FIXTURES) {
    await dumpFixture(fixture);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
