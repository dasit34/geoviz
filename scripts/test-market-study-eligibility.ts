/* eslint-disable no-console */
/**
 * scripts/test-market-study-eligibility.ts
 *
 * Pure unit tests for the Market Study eligibility gate + derived
 * per-entry status. No DB, no network.
 *
 *   npx tsx scripts/test-market-study-eligibility.ts
 */
import assert from "node:assert/strict";

import { classifyLeadForAudit } from "../src/lib/market-studies/eligibility";
import { deriveEntryStatus } from "../src/lib/market-studies/entryStatus";
import type {
  EligibilityContext,
  EligibilityLead,
} from "../src/lib/market-studies/types";

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

function ctx(over: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    seenDomains: new Set(),
    studyLeadIds: new Set(),
    recentlyAuditedLeadIds: new Set(),
    ...over,
  };
}

function lead(over: Partial<EligibilityLead> = {}): EligibilityLead {
  return {
    id: "lead_1",
    businessName: "Rick's Roofing",
    website: "https://ricksroofing.com",
    domain: "ricksroofing.com",
    status: "QUALIFIED",
    ...over,
  };
}

console.log("[market-study-eligibility] running...");

check("a lead with a website is eligible (no qualification gate)", () => {
  for (const status of ["NEW", "QUALIFIED", "NOT_QUALIFIED", "CONTACTED"]) {
    const r = classifyLeadForAudit(lead({ status }), ctx());
    assert.equal(r.eligible, true, `status ${status} should be eligible`);
    if (r.eligible) assert.equal(r.normalizedDomain, "ricksroofing.com");
  }
});

check("no website → skipped", () => {
  const r = classifyLeadForAudit(lead({ website: null, domain: null }), ctx());
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.match(r.skipReason, /No website/i);
});

check("unparseable website → skipped", () => {
  const r = classifyLeadForAudit(
    lead({ website: "not a url at all", domain: null }),
    ctx(),
  );
  assert.equal(r.eligible, false);
});

check("DO_NOT_CONTACT and CLOSED are blocked", () => {
  for (const status of ["DO_NOT_CONTACT", "CLOSED"]) {
    const r = classifyLeadForAudit(lead({ status }), ctx());
    assert.equal(r.eligible, false, `${status} should be blocked`);
    if (!r.eligible) assert.match(r.skipReason, new RegExp(status));
  }
});

check("already in this study → skipped", () => {
  const r = classifyLeadForAudit(
    lead(),
    ctx({ studyLeadIds: new Set(["lead_1"]) }),
  );
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.match(r.skipReason, /Already in this study/i);
});

check("recently audited in a market study → skipped", () => {
  const r = classifyLeadForAudit(
    lead(),
    ctx({ recentlyAuditedLeadIds: new Set(["lead_1"]) }),
  );
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.match(r.skipReason, /last 30 days/i);
});

check("duplicate domain within one selection → second is skipped", () => {
  const c = ctx();
  const a = classifyLeadForAudit(lead({ id: "a" }), c);
  assert.equal(a.eligible, true);
  if (a.eligible) c.seenDomains.add(a.normalizedDomain);
  const b = classifyLeadForAudit(
    lead({ id: "b", website: "http://www.ricksroofing.com/", domain: null }),
    c,
  );
  assert.equal(b.eligible, false);
  if (!b.eligible) assert.match(b.skipReason, /Duplicate domain/i);
});

check("bare domain gets an https:// prefix in websiteUrl", () => {
  const r = classifyLeadForAudit(
    lead({ website: "ricksroofing.com", domain: "ricksroofing.com" }),
    ctx(),
  );
  assert.equal(r.eligible, true);
  if (r.eligible) assert.equal(r.websiteUrl, "https://ricksroofing.com");
});

// ── deriveEntryStatus ──
check("deriveEntryStatus maps reportStatus and skipReason", () => {
  assert.equal(
    deriveEntryStatus({ skipReason: "No website", auditOrder: null }),
    "skipped",
  );
  assert.equal(
    deriveEntryStatus({ skipReason: null, auditOrder: null }),
    "skipped",
  );
  const map: Record<string, string> = {
    queued: "queued",
    pending: "queued",
    running: "running",
    generated: "completed",
    failed: "failed",
    weird_unknown: "queued",
  };
  for (const [reportStatus, want] of Object.entries(map)) {
    assert.equal(
      deriveEntryStatus({
        skipReason: null,
        auditOrder: { reportStatus },
      }),
      want,
      `${reportStatus} → ${want}`,
    );
  }
});

if (failed > 0) {
  console.log(`[market-study-eligibility] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[market-study-eligibility] passed=${passed} failed=0`);
