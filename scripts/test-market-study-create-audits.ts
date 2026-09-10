/* eslint-disable no-console */
/**
 * scripts/test-market-study-create-audits.ts
 *
 * Unit test for createMarketStudyAudits — the per-lead bulk-queue
 * loop. Hand-rolled in-memory Prisma fake, no network, no real DB.
 *
 *   npx tsx scripts/test-market-study-create-audits.ts
 */
import assert from "node:assert/strict";

import {
  createMarketStudyAudits,
  type LeadDecision,
} from "../src/lib/market-studies/createStudyAudits";
import {
  MARKET_STUDY_AUDIT_EMAIL,
  MARKET_STUDY_QUEUED_AT,
  MARKET_STUDY_SESSION_PREFIX,
} from "../src/lib/market-studies/constants";
import { parseCalibrationNotes } from "../src/lib/calibration";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${label}`);
      passed += 1;
    })
    .catch((err: Error) => {
      const line = `  ✗ ${label} — ${err.message}`;
      console.log(line);
      failures.push(line);
      failed += 1;
    });
}

type Row = Record<string, unknown> & { id: string };

function createFakePrisma(opts: { existingStudyLeadIds?: Set<string> } = {}) {
  let n = 1;
  const auditOrders: Row[] = [];
  const entries: Row[] = [];
  const leadUpdates: Row[] = [];
  const seen = new Set<string>(); // studyId::leadId

  const db = {
    auditOrder: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `order_${n++}`, ...data };
        auditOrders.push(row);
        return { id: row.id };
      },
    },
    marketStudyEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${data.studyId}::${data.leadId}`;
        if (
          seen.has(key) ||
          (data.leadId &&
            typeof data.leadId === "string" &&
            opts.existingStudyLeadIds?.has(data.leadId))
        ) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        seen.add(key);
        const row = { id: `entry_${n++}`, ...data };
        entries.push(row);
        return { id: row.id };
      },
    },
    lead: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        leadUpdates.push({ id: where.id, ...data });
        return { id: where.id };
      },
    },
  };

  return { db, auditOrders, entries, leadUpdates };
}

function decision(over: Partial<LeadDecision> = {}): LeadDecision {
  return {
    lead: {
      id: "lead_1",
      businessName: "Rick's Roofing",
      website: "https://ricksroofing.com",
      domain: "ricksroofing.com",
      status: "QUALIFIED",
      category: "roofing",
    },
    result: {
      eligible: true,
      websiteUrl: "https://ricksroofing.com",
      normalizedDomain: "ricksroofing.com",
    },
    ...over,
  };
}

console.log("[market-study-create-audits] running...");

async function main() {
  await check("eligible lead → audit order with the market-study shape", async () => {
    const { db, auditOrders, entries, leadUpdates } = createFakePrisma();
    const res = await createMarketStudyAudits({
      prisma: db as never,
      studyId: "study_1",
      decisions: [decision()],
      resolveBusinessId: async () => "biz_1",
    });
    assert.equal(res.created.length, 1);
    assert.equal(res.skipped.length, 0);
    const o = auditOrders[0];
    assert.ok(
      String(o.stripeSessionId).startsWith(MARKET_STUDY_SESSION_PREFIX),
      "session prefix",
    );
    assert.equal(o.email, MARKET_STUDY_AUDIT_EMAIL);
    assert.equal(o.businessName, "Rick's Roofing", "real business name kept");
    assert.equal(o.reportStatus, "queued");
    assert.equal(
      (o.reportQueuedAt as Date).getTime(),
      MARKET_STUDY_QUEUED_AT.getTime(),
      "backdated queuedAt",
    );
    assert.equal(o.paymentStatus, "paid");
    assert.equal(o.reviewStatus, "pending");
    assert.equal(o.businessId, "biz_1");
    const notes = parseCalibrationNotes(o.adminNotes as string);
    assert.equal(notes?.industry, "roofing", "industry hint in adminNotes");

    assert.equal(entries.length, 1);
    assert.equal(entries[0].auditOrderId, o.id);
    assert.equal(entries[0].studyId, "study_1");
    assert.equal(leadUpdates[0].auditOrderId, o.id, "lead pointer backfilled");
  });

  await check("business linking failure is non-fatal", async () => {
    const { db, auditOrders } = createFakePrisma();
    const res = await createMarketStudyAudits({
      prisma: db as never,
      studyId: "s",
      decisions: [decision()],
      resolveBusinessId: async () => {
        throw new Error("resolver blew up");
      },
    });
    assert.equal(res.created.length, 1);
    assert.equal(auditOrders[0].businessId, undefined);
  });

  await check("ineligible lead → skip-only entry, no audit order", async () => {
    const { db, auditOrders, entries } = createFakePrisma();
    const res = await createMarketStudyAudits({
      prisma: db as never,
      studyId: "s",
      decisions: [
        decision({
          result: { eligible: false, skipReason: "No website on file" },
        }),
      ],
    });
    assert.equal(res.created.length, 0);
    assert.equal(res.skipped.length, 1);
    assert.equal(res.skipped[0].skipReason, "No website on file");
    assert.equal(auditOrders.length, 0);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].auditOrderId, undefined);
    assert.equal(entries[0].skipReason, "No website on file");
  });

  await check("duplicate (P2002) on entry → skipped, not thrown", async () => {
    const { db } = createFakePrisma({
      existingStudyLeadIds: new Set(["lead_1"]),
    });
    const res = await createMarketStudyAudits({
      prisma: db as never,
      studyId: "s",
      decisions: [decision()],
      resolveBusinessId: async () => null,
    });
    assert.equal(res.created.length, 0);
    assert.equal(res.skipped.length, 1);
    assert.match(res.skipped[0].skipReason, /Already in this study/i);
  });

  await check("partial failure isolates one lead, rest still queue", async () => {
    const { db, auditOrders } = createFakePrisma();
    let calls = 0;
    const dbWithFlake = {
      ...db,
      auditOrder: {
        create: async (args: { data: Record<string, unknown> }) => {
          calls += 1;
          if (calls === 2) throw new Error("transient db blip");
          return db.auditOrder.create(args);
        },
      },
    };
    const res = await createMarketStudyAudits({
      prisma: dbWithFlake as never,
      studyId: "s",
      decisions: [
        decision({ lead: { ...decision().lead, id: "a" } }),
        decision({
          lead: { ...decision().lead, id: "b" },
          result: {
            eligible: true,
            websiteUrl: "https://b.com",
            normalizedDomain: "b.com",
          },
        }),
        decision({
          lead: { ...decision().lead, id: "c" },
          result: {
            eligible: true,
            websiteUrl: "https://c.com",
            normalizedDomain: "c.com",
          },
        }),
      ],
      resolveBusinessId: async () => null,
    });
    assert.equal(res.created.length, 2, "a and c queued");
    assert.equal(res.skipped.length, 1, "b captured as an error skip");
    assert.match(res.skipped[0].skipReason, /Error:/);
    assert.equal(auditOrders.length, 2);
  });
}

main()
  .then(() => {
    if (failed > 0) {
      console.log(
        `[market-study-create-audits] FAILED — passed=${passed} failed=${failed}`,
      );
      for (const f of failures) console.log(f);
      process.exit(1);
    }
    console.log(`[market-study-create-audits] passed=${passed} failed=0`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
