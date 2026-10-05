/* eslint-disable no-console */
/**
 * scripts/test-free-check-benchmark.ts
 *
 * Free-check scoring v1.3 regression benchmark. Stable, synthetic fixture
 * sites (scripts/fixtures/free-check/<case>/: site.json, index.html,
 * robots.txt, sitemap.xml, expected.json) run through the REAL production
 * path — the SSRF-safe fetcher (fake DNS + transport serving the fixture
 * files), the preflight analyzers, classification, and scoring. No network,
 * no database, no real brands.
 *
 * Per case: pinned business type, scored / not scored, overall score, every
 * check's status, and the fixes. Global invariants hold for every case.
 *
 *   npx tsx scripts/test-free-check-benchmark.ts            # verify
 *   npx tsx scripts/test-free-check-benchmark.ts --print    # show observed results
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { checkIdForFix } from "../src/lib/free-check/deriveChecks";
import { runFreeCheckDetailed } from "../src/lib/free-check/runFreeCheck";
import { CHECK_ROUTE_FETCH_OPTIONS, createSafeHtmlFetcher } from "../src/lib/free-check/safe-html-fetcher";
import type { FreeCheckFailure, FreeCheckResult } from "../src/lib/free-check/types";
import type { Resolver, Transport } from "../src/lib/monitoring/website/safe-fetch";

const DIR = path.join(__dirname, "fixtures/free-check");
const PRINT = process.argv.includes("--print");

type Expected =
  | { failure: true }
  | {
      type: FreeCheckResult["businessType"];
      scored: boolean;
      score: number | null;
      statuses: Record<string, string>;
      fixes: string[];
    };

let passed = 0;
let failed = 0;
const failures: string[] = [];
async function check(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

function fixtureNet(caseDir: string, domain: string, homepageStatus = 200) {
  const file = (name: string) => (existsSync(path.join(caseDir, name)) ? readFileSync(path.join(caseDir, name), "utf8") : null);
  const routes: Record<string, { body: string; type: string } | null> = {
    [`https://${domain}/`]: file("index.html") === null ? null : { body: file("index.html")!, type: "text/html; charset=utf-8" },
    [`https://${domain}/robots.txt`]: file("robots.txt") === null ? null : { body: file("robots.txt")!, type: "text/plain" },
    [`https://${domain}/sitemap.xml`]: file("sitemap.xml") === null ? null : { body: file("sitemap.xml")!, type: "application/xml" },
  };
  const resolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
  const transport: Transport = async (url) => {
    const r = routes[url.toString()];
    const status = url.pathname === "/" ? homepageStatus : 200;
    return r
      ? { status, headers: { "content-type": r.type }, body: Buffer.from(r.body), truncated: false }
      : { status: 404, headers: { "content-type": "text/html" }, body: Buffer.from("not found"), truncated: false };
  };
  return { resolver, transport };
}

async function runCase(name: string): Promise<FreeCheckResult | FreeCheckFailure> {
  const caseDir = path.join(DIR, name);
  const site = JSON.parse(readFileSync(path.join(caseDir, "site.json"), "utf8")) as { domain: string; homepageStatus?: number; input: { businessName: string; city: string; state: string; category: string } };
  const url = `https://${site.domain}/`;
  const { fetcher } = createSafeHtmlFetcher(url, { ...CHECK_ROUTE_FETCH_OPTIONS, ...fixtureNet(caseDir, site.domain, site.homepageStatus) });
  return (await runFreeCheckDetailed({ websiteUrl: url, ...site.input }, { fetcher })).result;
}

// Wording that must never reach a non-local result's labels or fixes.
const STOREFRONT = /LocalBusiness|opening hours|openingHours|street address|\bservices\b/i;
// Wording that must never appear in any fix (claims about popularity / AI recommendations).
const OVERCLAIM = /rank|popular|guarantee|recommend (you|your business)|chatgpt|claude|gemini|perplexity/i;

async function main() {
  console.log("\nfree-check v1.3 benchmark (fixtures, no network)\n");
  const cases = readdirSync(DIR).filter((d) => existsSync(path.join(DIR, d, "site.json"))).sort();
  assert.ok(cases.length >= 14, `expected at least 14 fixture cases, found ${cases.length}`);

  for (const name of cases) {
    const result = await runCase(name);
    if (PRINT) {
      console.log(name, JSON.stringify(result.ok ? { type: result.businessType, reasons: result.businessTypeReasons, scored: result.scored, score: result.overallScore, statuses: Object.fromEntries(result.checks.map((c) => [c.id, c.status])), fixes: result.fixes } : { failure: true, error: result.error }));
      continue;
    }
    const expected = JSON.parse(readFileSync(path.join(DIR, name, "expected.json"), "utf8")) as Expected;

    await check(`${name}: matches pinned expectation`, () => {
      if ("failure" in expected) {
        assert.equal(result.ok, false, "expected a failure");
        if (!result.ok) assert.ok(!/stack|Error:|ECONN|93\.184/i.test(result.error), result.error);
        return;
      }
      assert.ok(result.ok, result.ok ? "" : result.error);
      if (!result.ok) return;
      assert.equal(result.businessType, expected.type, `type (reasons: ${result.businessTypeReasons.join("; ")})`);
      assert.equal(result.scored, expected.scored, "scored");
      assert.equal(result.overallScore, expected.score, "overall score");
      assert.deepEqual(Object.fromEntries(result.checks.map((c) => [c.id, c.status])), expected.statuses, "check statuses");
      assert.deepEqual(result.fixes, expected.fixes, "fixes");
    });

    if (!result.ok) continue;
    await check(`${name}: invariants`, () => {
      assert.equal(result.scoringVersion, "free-check-v1.3");
      assert.ok(result.businessTypeReasons.length > 0, "classification has a reason");
      // Score is null exactly when the site is outside the supported scope.
      // Only local and online businesses are scored.
      assert.equal(result.scored, result.businessType === "local" || result.businessType === "online", "scored iff local or online");
      if (result.scored) {
        assert.ok(typeof result.overallScore === "number" && result.overallScore >= 0 && result.overallScore <= 100);
        assert.equal(result.unscoredReason, null);
      }
      else {
        assert.equal(result.overallScore, null);
        assert.deepEqual(result.fixes, [], "no fixes for unscored sites");
        assert.ok(result.scopeNote?.startsWith("Not scored —"), "unscored sites carry a 'Not scored —' note");
        assert.ok(result.unscoredReason, "unscored sites say why");
        assert.equal(result.strengths.length + result.problems.length >= 0, true);
      }
      // Fixes come only from applicable, non-Strong checks.
      const done = new Set(result.checks.filter((c) => c.status === "strong" || c.status === "not_applicable").map((c) => c.id));
      for (const fix of result.fixes) {
        const id = checkIdForFix(fix);
        assert.ok(id && !done.has(id), `fix "${fix}" comes from ${id}, which is Strong or not applicable`);
        assert.ok(!OVERCLAIM.test(fix), `overclaiming fix: ${fix}`);
      }
      // Non-local results never use storefront wording in labels or fixes.
      if (result.businessType !== "local") {
        const text = [...result.fixes, ...result.checks.map((c) => c.label)].join(" | ");
        assert.ok(!STOREFRONT.test(text), `storefront wording in a ${result.businessType} result: ${text}`);
      }
    });
  }

  if (PRINT) return;

  // /check results UI: an unscored result never shows a number, priorities, or the paid-audit offer.
  await check("/check UI: unscored results show 'Not scored' with no score, no priorities, no audit offer", async () => {
    const React = await import("react");
    (globalThis as { React?: unknown }).React = React; // tsx compiles JSX to React.createElement
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { FreeCheckResults } = await import("../src/components/FreeCheckResults");
    const input = { websiteUrl: "https://a.example", businessName: "A", email: "a@b.example" };
    for (const name of ["07-publisher-newsmedia-schema", "12-uncertain-brochure", "17-insufficient-js-shell"]) {
      const r = await runCase(name);
      assert.ok(r.ok && !r.scored, name);
      if (!r.ok) continue;
      const html = renderToStaticMarkup(React.createElement(FreeCheckResults, { result: r, input }));
      assert.ok(html.includes("Not scored"), `${name}: 'Not scored'`);
      assert.ok(!/\/100|\$97|Recommended priorities|Top problems|Priority 1/.test(html), `${name}: shows a score, priorities, or the audit offer`);
      assert.ok(!html.includes("Not scored — Not scored"), `${name}: duplicated label`);
    }
    const scored = await runCase("05-saas-software-schema");
    assert.ok(scored.ok && scored.scored);
    if (scored.ok) {
      const html = renderToStaticMarkup(React.createElement(FreeCheckResults, { result: scored, input }));
      assert.ok(html.includes("Recommended priorities") && html.includes("$97") && !html.includes("Not scored"), "scored result keeps the normal UI");
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.log(`fatal: ${(err as Error).stack}`);
  process.exit(1);
});
