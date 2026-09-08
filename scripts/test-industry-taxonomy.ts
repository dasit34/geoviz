/* eslint-disable no-console */
/**
 * scripts/test-industry-taxonomy.ts
 *
 * Guards normalizeIndustry() keyword rules. Root-caused on the GeoViz
 * self-audit, which was labelled `nonprofit` because "GEO Foundation
 * Fix" matched a bare `foundation` token. "foundation" collides with
 * contractor services ("foundation repair / inspection") and product
 * names — it must only match in an unambiguous charitable phrasing.
 */

import assert from "node:assert/strict";

import { normalizeIndustry } from "../src/lib/intelligence/industry-taxonomy";

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

console.log("[industry-taxonomy] running...");

check("bare 'foundation' is NOT nonprofit", () => {
  for (const input of [
    "GEO Foundation Fix",
    "foundation repair contractor",
    "basement and foundation inspection",
    "AI visibility foundation layer",
  ]) {
    assert.notEqual(
      normalizeIndustry(input).normalized,
      "nonprofit",
      `"${input}" must not classify as nonprofit`,
    );
  }
});

check("'foundation repair' still reads as a trade", () => {
  const n = normalizeIndustry("foundation repair and waterproofing contractor");
  assert.ok(
    ["home_services", "contractor"].includes(n.normalized),
    `expected a trade slug, got "${n.normalized}"`,
  );
});

check("genuine charitable phrasings still classify as nonprofit", () => {
  for (const input of [
    "nonprofit organization",
    "non-profit",
    "not-for-profit community group",
    "501(c)(3) charity",
    "community foundation",
    "family foundation",
    "charitable foundation",
    "charitable trust",
  ]) {
    assert.equal(
      normalizeIndustry(input).normalized,
      "nonprofit",
      `"${input}" should classify as nonprofit`,
    );
  }
});

check("GeoViz self-description does not classify as nonprofit", () => {
  const n = normalizeIndustry(
    "GeoViz — AI visibility intelligence software. Offers an AI Visibility " +
      "Audit and a GEO Foundation Fix implementation package.",
  );
  assert.notEqual(n.normalized, "nonprofit");
});

if (failed > 0) {
  console.log(`[industry-taxonomy] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[industry-taxonomy] passed=${passed} failed=0`);
