/* eslint-disable no-console */
/**
 * scripts/test-api-key.ts
 *
 * Guards readApiKey() — provider API keys must be trimmed at the source so a
 * stray trailing space/newline on a Railway secret never reaches an auth header
 * (and a whitespace-only value reads as MISSING, not present-but-doomed).
 */
import assert from "node:assert/strict";

import { readApiKey } from "../src/lib/validators/apiKey";

let passed = 0;
let failed = 0;
function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    console.log(`  ✗ ${label} — ${(err as Error).message}`);
    failed += 1;
  }
}

console.log("[api-key] running...");
const VAR = "TEST_PROVIDER_KEY_XYZ";

check("present clean key → returned as-is", () => {
  process.env[VAR] = "sk-abc123";
  assert.equal(readApiKey(VAR), "sk-abc123");
});

check("surrounding whitespace/newline → trimmed", () => {
  process.env[VAR] = "  sk-abc123\n";
  assert.equal(readApiKey(VAR), "sk-abc123");
});

check("whitespace-only → null (reads as MISSING)", () => {
  process.env[VAR] = "   ";
  assert.equal(readApiKey(VAR), null);
});

check("empty string → null", () => {
  process.env[VAR] = "";
  assert.equal(readApiKey(VAR), null);
});

check("unset → null", () => {
  delete process.env[VAR];
  assert.equal(readApiKey(VAR), null);
});

console.log(`[api-key] passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
