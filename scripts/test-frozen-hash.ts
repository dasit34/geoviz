/* eslint-disable no-console */
/**
 * scripts/test-frozen-hash.ts
 *
 * Guards the scoring freeze-contract hashes in `src/lib/scoring/frozen.ts`.
 * The v1 canonicalizer silently dropped nested keys, so CATEGORY_HASH only
 * reflected category/bucket COUNTS. These tests prove the v2 hash reacts to
 * nested content (bucket membership, per-category max, renames), that
 * WEIGHT_HASH is byte-identical across the scheme change, and that
 * historical v1 stamps still verify against the current structure.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { BUCKET_MAP } from "../src/lib/scoring/buckets";
import {
  CATEGORY_HASH,
  CATEGORY_HASH_V1,
  HASH_SCHEME_VERSION,
  WEIGHT_HASH,
  categoryHashMatchesCurrent,
  computeCategoryHash,
} from "../src/lib/scoring/frozen";
import { scoreAudit } from "../src/lib/scoring";
import { gatherEvidence } from "../src/lib/scoring/evidence";
import { buildReplayBundle } from "../src/lib/scoring/replay-bundle";
import { CATEGORY_MAX } from "../src/lib/scoring/types";

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

console.log("[frozen-hash] running...");

const baseMax: Record<string, number> = { ...CATEGORY_MAX };
const baseBuckets: Record<string, string[]> = Object.fromEntries(
  Object.entries(BUCKET_MAP).map(([k, v]) => [k, [...v]]),
);

check("CATEGORY_HASH equals computeCategoryHash of the live structure", () => {
  assert.equal(CATEGORY_HASH, computeCategoryHash(baseMax, baseBuckets));
  assert.match(CATEGORY_HASH, /^[0-9a-f]{16}$/);
});

check("moving a category between buckets changes the v2 hash", () => {
  const moved = {
    ...baseBuckets,
    understanding: ["schema"],
    trust: ["trust", "brand"],
  };
  assert.notEqual(computeCategoryHash(baseMax, moved), CATEGORY_HASH);
});

check("v1 scheme was blind to that same bucket move (documents the bug)", () => {
  const moved = {
    ...baseBuckets,
    understanding: ["schema"],
    trust: ["trust", "brand"],
  };
  assert.equal(computeCategoryHash(baseMax, moved, "v1"), CATEGORY_HASH_V1);
});

check("changing a category max changes the v2 hash", () => {
  assert.notEqual(
    computeCategoryHash({ ...baseMax, schema: 24, content: 16 }, baseBuckets),
    CATEGORY_HASH,
  );
});

check("renaming a category key changes the v2 hash", () => {
  const { brand, ...rest } = baseMax;
  assert.notEqual(
    computeCategoryHash({ ...rest, entity: brand }, baseBuckets),
    CATEGORY_HASH,
  );
});

check("key authoring order does not change the v2 hash", () => {
  const reversedMax = Object.fromEntries(Object.entries(baseMax).reverse());
  const reversedBuckets = Object.fromEntries(
    Object.entries(baseBuckets)
      .reverse()
      .map(([k, v]) => [k, [...v].reverse()]),
  );
  assert.equal(computeCategoryHash(reversedMax, reversedBuckets), CATEGORY_HASH);
});

check("WEIGHT_HASH is unchanged by the scheme fix (flat object)", () => {
  // Value stamped on every audit before the v2 fix.
  assert.equal(WEIGHT_HASH, "ca1cee6c3ffa57a3");
});

check("CATEGORY_HASH_V1 equals the value historical rows carry", () => {
  // Value stamped on every audit before the v2 fix.
  assert.equal(CATEGORY_HASH_V1, "1fee8afd43b62320");
  assert.notEqual(CATEGORY_HASH, CATEGORY_HASH_V1);
});

check("categoryHashMatchesCurrent verifies each stamp under its own scheme", () => {
  assert.equal(categoryHashMatchesCurrent(CATEGORY_HASH_V1, undefined), true);
  assert.equal(categoryHashMatchesCurrent(CATEGORY_HASH_V1, null), true);
  assert.equal(categoryHashMatchesCurrent(CATEGORY_HASH_V1, "v1"), true);
  assert.equal(categoryHashMatchesCurrent(CATEGORY_HASH, HASH_SCHEME_VERSION), true);
  // Cross-scheme stamps never match.
  assert.equal(categoryHashMatchesCurrent(CATEGORY_HASH, undefined), false);
  assert.equal(categoryHashMatchesCurrent(CATEGORY_HASH_V1, "v2"), false);
  assert.equal(categoryHashMatchesCurrent("deadbeefdeadbeef", "v2"), false);
});

check("new DeterministicScore + ReplayBundle are stamped with hash_scheme v2", () => {
  const input = { preflightSignals: null, intelligenceIngest: null, renderResult: null };
  const score = scoreAudit(input);
  const evidence = gatherEvidence(input);
  assert.equal(score.hash_scheme, HASH_SCHEME_VERSION);
  assert.equal(score.category_hash, CATEGORY_HASH);
  const bundle = buildReplayBundle({
    preflightSignals: null,
    intelligenceIngest: null,
    renderResult: null,
    history: null,
    evidence,
    deterministic: score,
    computedAt: new Date(0),
  });
  assert.equal(bundle.hash_scheme, HASH_SCHEME_VERSION);
  assert.equal(bundle.category_hash, CATEGORY_HASH);
});

console.log(`[frozen-hash] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
