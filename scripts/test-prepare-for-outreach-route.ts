/* eslint-disable no-console */
/**
 * scripts/test-prepare-for-outreach-route.ts
 *
 * Route-level tests for POST /api/admin/leads/prepare-for-outreach —
 * imports the real exported `POST` handler directly (same pattern as
 * scripts/test-outbound-sync-route.ts), real DB fixtures, cleanup in
 * a `finally` block.
 *
 * Deliberately uses the REAL (non-injected) qualify/enrich functions,
 * since the route never exposes fake injection — but every fixture is
 * engineered to short-circuit BEFORE any live network call:
 *   - "does not qualify" fixture has no website, so the real
 *     `qualifyLead` returns { score: 0, qualified: false } from its
 *     own guard without ever calling fetch.
 *   - "already enriched" fixture already has a `contactEmail`, so the
 *     orchestrator's own idempotency guard skips `enrichOneLead`
 *     entirely — the real Outscraper enrichment provider is never
 *     called by this script.
 *
 * Run: npx tsx scripts/test-prepare-for-outreach-route.ts
 */
import { prisma } from "@/lib/db";
import { POST as prepareForOutreachPOST } from "../src/app/api/admin/leads/prepare-for-outreach/route";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error("ADMIN_SECRET not set — cannot run.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${label} — ${msg}`);
    console.log(`  ✗ ${label} — ${msg}`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const URL = "http://localhost/api/admin/leads/prepare-for-outreach";

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function authedRequest(body: unknown): Request {
  return jsonRequest(body, { "x-admin-secret": ADMIN_SECRET! });
}

const MARKER = `test-prepare-outreach-route-${Date.now()}`;
let seq = 0;
const leadIdsCreated: string[] = [];

async function makeLead(overrides: Partial<{ status: string; website: string | null; contactEmail: string | null }>) {
  seq += 1;
  const lead = await prisma.lead.create({
    data: {
      businessName: `${MARKER}-${seq}`,
      businessNameNormalized: `${MARKER}-${seq}`.toLowerCase(),
      website: overrides.website === undefined ? null : overrides.website,
      source: "manual",
      status: overrides.status ?? "NEW",
      contactEmail: overrides.contactEmail ?? null,
    },
  });
  leadIdsCreated.push(lead.id);
  return lead;
}

async function main(): Promise<void> {
  console.log("[prepare-for-outreach-route] running...");

  try {
    await check("rejects a request with no admin key (401)", async () => {
      const res = await prepareForOutreachPOST(jsonRequest({ ids: ["whatever"] }));
      assert(res.status === 401, `expected 401, got ${res.status}`);
    });

    await check("rejects a request with a wrong admin key (401)", async () => {
      const res = await prepareForOutreachPOST(jsonRequest({ ids: ["whatever"] }, { "x-admin-secret": "definitely-wrong" }));
      assert(res.status === 401, `expected 401, got ${res.status}`);
    });

    await check("rejects an empty ids[] (400)", async () => {
      const res = await prepareForOutreachPOST(authedRequest({ ids: [] }));
      assert(res.status === 400, `expected 400, got ${res.status}`);
    });

    await check("rejects a batch over the max size (400)", async () => {
      const tooMany = Array.from({ length: 26 }, (_, i) => `fake-id-${i}`);
      const res = await prepareForOutreachPOST(authedRequest({ ids: tooMany }));
      assert(res.status === 400, `expected 400, got ${res.status}`);
    });

    await check("NEW lead with no website does not qualify — real qualifyLead, zero live fetch", async () => {
      const lead = await makeLead({ status: "NEW", website: null });
      const res = await prepareForOutreachPOST(authedRequest({ ids: [lead.id] }));
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.summary.notQualified === 1, `expected notQualified=1, got ${JSON.stringify(data.summary)}`);
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert(updated.status === "NOT_QUALIFIED", `expected NOT_QUALIFIED, got ${updated.status}`);
    });

    await check("already-enriched QUALIFIED lead is ready immediately, real enrichOneLead never called", async () => {
      const lead = await makeLead({ status: "QUALIFIED", contactEmail: "already@example.com" });
      const res = await prepareForOutreachPOST(authedRequest({ ids: [lead.id] }));
      const data = await res.json();
      assert(data.summary.readyForInstantly === 1, `expected readyForInstantly=1, got ${JSON.stringify(data.summary)}`);
      assert(data.summary.enrichmentAttempted === 0, "enrichment must not have been attempted");
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert(updated.status === "READY_FOR_CONTACT", `expected READY_FOR_CONTACT, got ${updated.status}`);
    });

    await check("duplicate click: calling the route twice on the same lead is a stable no-op", async () => {
      const lead = await makeLead({ status: "QUALIFIED", contactEmail: "stable@example.com" });
      const first = await (await prepareForOutreachPOST(authedRequest({ ids: [lead.id] }))).json();
      const second = await (await prepareForOutreachPOST(authedRequest({ ids: [lead.id] }))).json();
      assert(
        JSON.stringify(first.summary) === JSON.stringify(second.summary),
        `expected identical summaries, got ${JSON.stringify(first.summary)} vs ${JSON.stringify(second.summary)}`,
      );
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert(updated.status === "READY_FOR_CONTACT", "status remains stable across repeated calls");
    });
  } finally {
    if (leadIdsCreated.length > 0) {
      await prisma.lead.deleteMany({ where: { id: { in: leadIdsCreated } } });
    }
  }

  console.log(`[prepare-for-outreach-route] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("[prepare-for-outreach-route] unexpected error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
