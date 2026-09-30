/* eslint-disable no-console */
/**
 * scripts/test-prepare-for-outreach.ts
 *
 * Decision-tree tests for `prepareLeadsForOutreach()`
 * (src/lib/leads/prepareForOutreach.ts) — the orchestration layer
 * over the EXISTING qualification/enrichment services. Real DB,
 * disposable marker-tagged fixture leads (same pattern as
 * scripts/test-business-linking.ts), cleanup in a `finally` block.
 *
 * `qualifyFn`/`enrichFn` are always INJECTED FAKES here — this test
 * never performs a live HTML fetch or a paid Outscraper call. Fakes
 * that write DB fields mimic exactly what the real functions would
 * write, so downstream status-transition logic is exercised against
 * real Prisma state.
 *
 * Run: npx tsx scripts/test-prepare-for-outreach.ts
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { prepareLeadsForOutreach } from "@/lib/leads/prepareForOutreach";
import type { QualificationResult } from "@/lib/leads/qualifyLead";
import type { EnrichOneLeadResult } from "@/lib/leads/enrichLead";

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

function trackedFn<A extends unknown[], R>(impl: (...args: A) => Promise<R>) {
  let count = 0;
  const fn = async (...args: A): Promise<R> => {
    count += 1;
    return impl(...args);
  };
  return { fn, count: () => count };
}

function fakeQualify(score: number, qualified: boolean) {
  return trackedFn(async (_args: unknown): Promise<QualificationResult> => ({
    score,
    qualified,
    reasons: [`fake reason score=${score}`],
  }));
}

function fakeQualifyThrows(message: string) {
  return trackedFn(async (_args: unknown): Promise<QualificationResult> => {
    throw new Error(message);
  });
}

function fakeQualifyNeverCalled() {
  return trackedFn(async (_args: unknown): Promise<QualificationResult> => {
    throw new Error("qualifyFn should not have been called for this lead");
  });
}

function fakeEnrichSuccess(contactEmail: string) {
  return trackedFn(async (leadId: string): Promise<EnrichOneLeadResult> => {
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { contactEmail, contactSource: "fake-test-provider", enrichedAt: new Date() },
    });
    return { ok: true, lead };
  });
}

function fakeEnrichFailure(error: string) {
  return trackedFn(async (_leadId: string): Promise<EnrichOneLeadResult> => ({
    ok: false,
    status: 404,
    error,
  }));
}

function fakeEnrichNeverCalled() {
  return trackedFn(async (_leadId: string): Promise<EnrichOneLeadResult> => {
    throw new Error("enrichFn should not have been called for this lead");
  });
}

const MARKER = `test-prepare-outreach-${Date.now()}`;
let seq = 0;
const leadIdsCreated: string[] = [];

async function makeLead(overrides: Partial<{ status: string; website: string | null; contactEmail: string | null }>) {
  seq += 1;
  const lead = await prisma.lead.create({
    data: {
      businessName: `${MARKER}-${seq}`,
      businessNameNormalized: `${MARKER}-${seq}`.toLowerCase(),
      website: overrides.website === undefined ? `https://${MARKER}-${seq}.invalid` : overrides.website,
      domain: overrides.website === null ? null : `${MARKER}-${seq}.invalid`,
      source: "manual",
      status: overrides.status ?? "NEW",
      contactEmail: overrides.contactEmail ?? null,
    },
  });
  leadIdsCreated.push(lead.id);
  return lead;
}

async function main(): Promise<void> {
  console.log("[prepare-for-outreach] running...");

  try {
    await check("NEW -> qualifies -> enriches -> ready for Instantly", async () => {
      const lead = await makeLead({ status: "NEW" });
      const q = fakeQualify(90, true);
      const e = fakeEnrichSuccess("contact@example.com");
      const { summary, details } = await prepareLeadsForOutreach([lead.id], { qualifyFn: q.fn, enrichFn: e.fn });

      assert.equal(q.count(), 1);
      assert.equal(e.count(), 1);
      assert.equal(details[0].isQualified, true);
      assert.equal(details[0].enrichmentAttempted, true);
      assert.equal(details[0].enrichedSuccessfully, true);
      assert.equal(details[0].hasValidContact, true);
      assert.deepEqual(summary, {
        selected: 1, qualified: 1, notQualified: 0, enrichmentAttempted: 1,
        enrichedSuccessfully: 1, noValidContact: 0, readyForInstantly: 1, failed: 0,
      });
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(updated.status, "READY_FOR_CONTACT");
    });

    await check("NEW -> does not qualify -> stops, enrichment never attempted", async () => {
      const lead = await makeLead({ status: "NEW" });
      const q = fakeQualify(10, false);
      const e = fakeEnrichNeverCalled();
      const { summary, details } = await prepareLeadsForOutreach([lead.id], { qualifyFn: q.fn, enrichFn: e.fn });

      assert.equal(e.count(), 0, "enrichment must never be attempted for a NOT_QUALIFIED lead");
      assert.equal(details[0].isQualified, false);
      assert.equal(details[0].enrichmentAttempted, false);
      assert.equal(summary.qualified, 0);
      assert.equal(summary.notQualified, 1);
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(updated.status, "NOT_QUALIFIED");
    });

    await check("already-QUALIFIED skips qualification, proceeds to enrichment", async () => {
      const lead = await makeLead({ status: "QUALIFIED" });
      const q = fakeQualifyNeverCalled();
      const e = fakeEnrichSuccess("someone@example.org");
      const { details } = await prepareLeadsForOutreach([lead.id], { qualifyFn: q.fn, enrichFn: e.fn });

      assert.equal(q.count(), 0, "qualification must be skipped for an already-QUALIFIED lead");
      assert.equal(e.count(), 1);
      assert.equal(details[0].hasValidContact, true);
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(updated.status, "READY_FOR_CONTACT");
    });

    await check("already-enriched (has contactEmail) skips duplicate enrichment work", async () => {
      const lead = await makeLead({ status: "QUALIFIED", contactEmail: "existing@example.com" });
      const q = fakeQualifyNeverCalled();
      const e = fakeEnrichNeverCalled();
      const { summary, details } = await prepareLeadsForOutreach([lead.id], { qualifyFn: q.fn, enrichFn: e.fn });

      assert.equal(e.count(), 0, "enrichment must never be re-attempted on a lead that already has a contactEmail");
      assert.equal(details[0].enrichmentAttempted, false);
      assert.equal(details[0].hasValidContact, true);
      assert.equal(summary.readyForInstantly, 1);
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(updated.status, "READY_FOR_CONTACT", "a QUALIFIED lead with an already-usable email is still promoted");
    });

    await check("mixed selection: NEW + NOT_QUALIFIED + DO_NOT_CONTACT processed independently", async () => {
      const newLead = await makeLead({ status: "NEW" });
      const notQualifiedLead = await makeLead({ status: "NOT_QUALIFIED" });
      const blockedLead = await makeLead({ status: "DO_NOT_CONTACT" });
      const q = fakeQualify(80, true);
      const e = fakeEnrichSuccess("mixed@example.com");

      const { summary } = await prepareLeadsForOutreach(
        [newLead.id, notQualifiedLead.id, blockedLead.id],
        { qualifyFn: q.fn, enrichFn: e.fn },
      );

      assert.equal(q.count(), 1, "qualifyFn is only invoked for the NEW lead in a mixed batch");
      assert.equal(e.count(), 1, "enrichFn is only invoked for the lead that reached the qualified stage");
      assert.equal(summary.selected, 3);
      assert.equal(summary.qualified, 1);
      assert.equal(summary.notQualified, 2);
      assert.equal(summary.readyForInstantly, 1);
    });

    await check("enrichment finds no contact -> counted as noValidContact, not failed", async () => {
      const lead = await makeLead({ status: "QUALIFIED" });
      const e = fakeEnrichFailure("No contact found.");
      const { summary, details } = await prepareLeadsForOutreach([lead.id], { enrichFn: e.fn });

      assert.equal(details[0].enrichmentAttempted, true);
      assert.equal(details[0].enrichedSuccessfully, false);
      assert.equal(details[0].failed, false);
      assert.equal(summary.noValidContact, 1);
      assert.equal(summary.failed, 0);
      assert.equal(summary.readyForInstantly, 0);
    });

    await check("enrichment finds a disposable/unusable email -> not marked ready, status not upgraded", async () => {
      const lead = await makeLead({ status: "QUALIFIED" });
      const e = fakeEnrichSuccess("bounce@mailinator.com");
      const { summary, details } = await prepareLeadsForOutreach([lead.id], { enrichFn: e.fn });

      assert.equal(details[0].enrichedSuccessfully, true, "a contact WAS found and saved");
      assert.equal(details[0].hasValidContact, false, "but a disposable-domain email is not usable");
      assert.equal(summary.readyForInstantly, 0);
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(updated.status, "QUALIFIED", "status must not be upgraded on an unusable email");
    });

    await check("never downgrades an already-CONTACTED lead", async () => {
      const lead = await makeLead({ status: "CONTACTED" });
      const q = fakeQualifyNeverCalled();
      const e = fakeEnrichSuccess("advanced@example.com");
      const { summary } = await prepareLeadsForOutreach([lead.id], { qualifyFn: q.fn, enrichFn: e.fn });

      assert.equal(summary.readyForInstantly, 1, "a CONTACTED lead with a valid contact still counts as ready");
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(updated.status, "CONTACTED", "status must never be downgraded from CONTACTED back to READY_FOR_CONTACT");
    });

    await check("an unknown lead id fails cleanly without crashing the rest of the batch", async () => {
      const goodLead = await makeLead({ status: "QUALIFIED" });
      const e = fakeEnrichSuccess("ok@example.com");
      const { summary, details } = await prepareLeadsForOutreach(
        ["nonexistent-lead-id-xyz", goodLead.id],
        { enrichFn: e.fn },
      );

      const badOutcome = details.find((d) => d.id === "nonexistent-lead-id-xyz");
      assert.ok(badOutcome?.failed, "unknown lead id lands in the failed bucket");
      const goodOutcome = details.find((d) => d.id === goodLead.id);
      assert.equal(goodOutcome?.hasValidContact, true, "the other lead in the batch is unaffected");
      assert.equal(summary.failed, 1);
      assert.equal(summary.readyForInstantly, 1);
    });

    await check("a thrown exception for one lead is isolated from the rest of the batch", async () => {
      const throwingLead = await makeLead({ status: "NEW" });
      const goodLead = await makeLead({ status: "NEW" });
      let call = 0;
      const q = trackedFn(async (_args: unknown): Promise<QualificationResult> => {
        call += 1;
        if (call === 1) throw new Error("simulated qualify crash");
        return { score: 95, qualified: true, reasons: [] };
      });
      const e = fakeEnrichSuccess("survivor@example.com");

      const { summary, details } = await prepareLeadsForOutreach(
        [throwingLead.id, goodLead.id],
        { qualifyFn: q.fn, enrichFn: e.fn },
      );

      const failedOutcome = details.find((d) => d.id === throwingLead.id);
      assert.ok(failedOutcome?.failed);
      assert.match(failedOutcome!.reason, /simulated qualify crash/);
      const survivorOutcome = details.find((d) => d.id === goodLead.id);
      assert.equal(survivorOutcome?.hasValidContact, true, "the second lead still processes correctly");
      assert.equal(summary.failed, 1);
      assert.equal(summary.readyForInstantly, 1);
    });

    await check("idempotency: running the SAME batch twice makes zero additional calls the second time", async () => {
      const lead = await makeLead({ status: "NEW" });
      const q = fakeQualify(90, true);
      const e = fakeEnrichSuccess("idempotent@example.com");

      const first = await prepareLeadsForOutreach([lead.id], { qualifyFn: q.fn, enrichFn: e.fn });
      assert.equal(q.count(), 1);
      assert.equal(e.count(), 1);
      assert.equal(first.summary.readyForInstantly, 1);

      const second = await prepareLeadsForOutreach([lead.id], { qualifyFn: q.fn, enrichFn: e.fn });
      assert.equal(q.count(), 1, "a second run must not call qualifyFn again");
      assert.equal(e.count(), 1, "a second run must not call enrichFn again");
      assert.deepEqual(second.summary, {
        selected: 1, qualified: 1, notQualified: 0, enrichmentAttempted: 0,
        enrichedSuccessfully: 0, noValidContact: 0, readyForInstantly: 1, failed: 0,
      });
      const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(updated.status, "READY_FOR_CONTACT");
    });
  } finally {
    if (leadIdsCreated.length > 0) {
      await prisma.lead.deleteMany({ where: { id: { in: leadIdsCreated } } });
    }
  }

  console.log(`[prepare-for-outreach] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("[prepare-for-outreach] unexpected error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
