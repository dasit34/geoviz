/* eslint-disable no-console */
/**
 * scripts/test-database-target.ts
 *
 * Pure unit tests for the fail-closed database-target classifier
 * (`src/lib/safety/database-target.ts`). No database, no network, no env
 * loading — every case passes an explicit env object. Safe to run with
 * the no-database sentinel (`npm run test:no-db`).
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import {
  NO_DATABASE_SENTINEL_URL,
  classifyDatabaseTarget,
} from "../src/lib/safety/database-target";

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

console.log("[database-target] running...");

const REMOTE = "postgresql://user:s3cret@db.remote-host.example:6543/railway";

check("unset DATABASE_URL → none, allowed", () => {
  const t = classifyDatabaseTarget(undefined, {});
  assert.equal(t.kind, "none");
  assert.equal(t.allowed, true);
});

check("no-database sentinel → none, allowed", () => {
  const t = classifyDatabaseTarget(NO_DATABASE_SENTINEL_URL, {});
  assert.equal(t.kind, "none");
  assert.equal(t.allowed, true);
});

check("localhost / 127.0.0.1 → local, allowed", () => {
  assert.equal(classifyDatabaseTarget("postgresql://u:p@localhost:5432/geoviz", {}).kind, "local");
  assert.equal(classifyDatabaseTarget("postgresql://u:p@127.0.0.1:5432/geoviz", {}).allowed, true);
});

check("unlisted remote host → unknown, REFUSED (fail-closed)", () => {
  const t = classifyDatabaseTarget(REMOTE, {});
  assert.equal(t.kind, "unknown");
  assert.equal(t.allowed, false);
});

check("remote host allowlisted by host:port → allowed", () => {
  const t = classifyDatabaseTarget(REMOTE, { GEOVIZ_NONPROD_DB_HOSTS: "db.remote-host.example:6543" });
  assert.equal(t.kind, "allowlisted_nonprod");
  assert.equal(t.allowed, true);
});

check("allowlist port mismatch → still refused", () => {
  const t = classifyDatabaseTarget(REMOTE, { GEOVIZ_NONPROD_DB_HOSTS: "db.remote-host.example:5432" });
  assert.equal(t.allowed, false);
});

check("production list beats allowlist and loopback", () => {
  const env = {
    GEOVIZ_NONPROD_DB_HOSTS: "db.remote-host.example",
    GEOVIZ_PRODUCTION_DB_HOSTS: "db.remote-host.example:6543, localhost:5432",
  };
  assert.equal(classifyDatabaseTarget(REMOTE, env).kind, "production");
  assert.equal(classifyDatabaseTarget("postgresql://u:p@localhost:5432/x", env).allowed, false);
});

check("railway run / VERCEL_ENV=production context → REFUSED even for localhost", () => {
  assert.equal(
    classifyDatabaseTarget("postgresql://u:p@localhost:5432/x", { RAILWAY_ENVIRONMENT_NAME: "production" }).allowed,
    false,
  );
  assert.equal(classifyDatabaseTarget(undefined, { VERCEL_ENV: "production" }).allowed, false);
});

check("unparseable URL → unknown, refused", () => {
  assert.equal(classifyDatabaseTarget("not a url", {}).allowed, false);
});

check("reason never contains credentials", () => {
  for (const env of [{}, { GEOVIZ_NONPROD_DB_HOSTS: "db.remote-host.example" }]) {
    const t = classifyDatabaseTarget(REMOTE, env);
    assert.doesNotMatch(t.reason, /s3cret|user:/);
    assert.doesNotMatch(JSON.stringify(t), /s3cret/);
  }
});

console.log(`[database-target] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
