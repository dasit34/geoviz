/* eslint-disable no-console */
/**
 * scripts/test-admin-auth.ts
 *
 * Guards the admin PAGE login hardening (launch readiness §6):
 *   1. verifyAdminPassword is constant-time-correct: right password passes,
 *      wrong/empty/whitespace fails, not-configured fails closed.
 *   2. adminCookieToken derives a SHA-256 token that is NOT the plaintext
 *      password (a leaked cookie must not reveal the password).
 *   3. The cookie token is deterministic and matches what isAuthed() would
 *      compare against (sha256 of the trimmed password).
 *
 * These functions are pure (no next/headers request scope), so they unit-
 * test cleanly. isAuthed() itself needs a request context and is covered
 * by the token-equality assertions here + manual dev verification.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  adminCookieToken,
  getAdminPassword,
  verifyAdminPassword,
} from "../src/lib/admin-auth";

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

console.log("[admin-auth] running...");

const PW = "correct horse battery staple";

check("not configured → everything fails closed", () => {
  delete process.env.ADMIN_PASSWORD;
  assert.equal(getAdminPassword(), undefined);
  assert.equal(adminCookieToken(), null);
  assert.equal(verifyAdminPassword(PW), false);
  assert.equal(verifyAdminPassword(""), false);
});

check("correct password verifies; wrong/empty/case do not", () => {
  process.env.ADMIN_PASSWORD = PW;
  assert.equal(verifyAdminPassword(PW), true);
  assert.equal(verifyAdminPassword(PW + " "), false);
  assert.equal(verifyAdminPassword("CORRECT HORSE BATTERY STAPLE"), false);
  assert.equal(verifyAdminPassword(""), false);
  assert.equal(verifyAdminPassword("wrong"), false);
});

check("env whitespace is trimmed (matches getAdminPassword)", () => {
  process.env.ADMIN_PASSWORD = `  ${PW}\n`;
  assert.equal(getAdminPassword(), PW);
  assert.equal(verifyAdminPassword(PW), true);
});

check("blank/whitespace-only password is treated as not configured", () => {
  process.env.ADMIN_PASSWORD = "   ";
  assert.equal(getAdminPassword(), undefined);
  assert.equal(adminCookieToken(), null);
  assert.equal(verifyAdminPassword(""), false);
});

check("cookie token is sha256(password), never the plaintext", () => {
  process.env.ADMIN_PASSWORD = PW;
  const token = adminCookieToken();
  assert.ok(token, "token should be present when configured");
  assert.notEqual(token, PW, "token must not equal the raw password");
  assert.match(token as string, /^[0-9a-f]{64}$/, "token is 64 hex chars");
  const expected = createHash("sha256").update(PW, "utf8").digest("hex");
  assert.equal(token, expected, "token is the deterministic sha256 of the pw");
});

check("token is stable across calls for the same password", () => {
  process.env.ADMIN_PASSWORD = PW;
  assert.equal(adminCookieToken(), adminCookieToken());
});

console.log(`[admin-auth] passed=${passed} failed=${failed}`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
