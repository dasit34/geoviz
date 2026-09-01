/**
 * Tests normalizeOutreachStatus() — defensive mapping from Instantly's
 * (partially unverified) raw status shapes to GeoViz's outreach enum.
 * Run: npx tsx scripts/test-outreach-status-normalization.ts
 */
import { normalizeOutreachStatus } from "@/lib/leads/normalizeOutreachStatus";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

assert(normalizeOutreachStatus("bounced") === "BOUNCED", "string 'bounced' -> BOUNCED");
assert(normalizeOutreachStatus("Email Bounced") === "BOUNCED", "case-insensitive, embedded in a phrase");
assert(normalizeOutreachStatus("unsubscribed") === "UNSUBSCRIBED", "string 'unsubscribed' -> UNSUBSCRIBED");
assert(normalizeOutreachStatus("lead_interested") === "INTERESTED", "string 'lead_interested' -> INTERESTED");
assert(normalizeOutreachStatus("reply_received") === "REPLIED", "string 'reply_received' -> REPLIED");
assert(normalizeOutreachStatus("Replied") === "REPLIED", "string 'Replied' -> REPLIED");
assert(normalizeOutreachStatus("account_error") === "FAILED", "string 'account_error' -> FAILED");

// Object shapes — scans values, not just top-level strings.
assert(normalizeOutreachStatus({ status: "bounced", code: 5 }) === "BOUNCED", "object with a 'bounced' value -> BOUNCED");
assert(
  normalizeOutreachStatus({ summary: { latest: "lead_unsubscribed" } }) === "UNSUBSCRIBED",
  "nested object value -> UNSUBSCRIBED",
);
assert(normalizeOutreachStatus(["ok", "interested"]) === "INTERESTED", "array of values -> matches the interesting one");

// Unrecognized / unverified shapes never crash and never invent a specific status.
assert(normalizeOutreachStatus(42) === "ACTIVE", "unrecognized numeric code falls back to ACTIVE, not invented");
assert(normalizeOutreachStatus(null) === "ACTIVE", "null falls back to ACTIVE");
assert(normalizeOutreachStatus(undefined) === "ACTIVE", "undefined falls back to ACTIVE");
assert(normalizeOutreachStatus({}) === "ACTIVE", "empty object falls back to ACTIVE");
assert(normalizeOutreachStatus("some_unknown_future_event") === "ACTIVE", "unrecognized string falls back to ACTIVE, never crashes");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
