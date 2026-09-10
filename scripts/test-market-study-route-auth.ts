/* eslint-disable no-console */
/**
 * scripts/test-market-study-route-auth.ts
 *
 * Exercises the market-studies API route handlers directly with a
 * hand-rolled in-memory Prisma fake (seeded on globalThis BEFORE the
 * route imports `@/lib/db`). No network, no real DB.
 *
 *   npx tsx scripts/test-market-study-route-auth.ts
 */
import assert from "node:assert/strict";

process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret-1234567890";
const KEY = process.env.ADMIN_SECRET;

let writeCount = 0;

const leads = [
  {
    id: "lead_ok",
    businessName: "Rick's Roofing",
    website: "https://ricksroofing.com",
    domain: "ricksroofing.com",
    status: "QUALIFIED",
    category: "roofing",
  },
  {
    id: "lead_noweb",
    businessName: "No Site LLC",
    website: null,
    domain: null,
    status: "QUALIFIED",
    category: null,
  },
];

const fakePrisma = {
  lead: {
    findMany: async ({ where }: { where?: { id?: { in?: string[] } } }) => {
      const ids = where?.id?.in ?? [];
      return leads.filter((l) => ids.includes(l.id));
    },
    update: async () => {
      writeCount += 1;
      return {};
    },
  },
  marketStudyEntry: {
    findMany: async () => [],
    create: async () => {
      writeCount += 1;
      return { id: "e1" };
    },
  },
  marketStudy: {
    findMany: async () => [],
    findUnique: async () => null,
    create: async () => {
      writeCount += 1;
      return { id: "s1", name: "x" };
    },
  },
  auditOrder: {
    aggregate: async () => ({
      _avg: { estimatedCostUsd: null },
      _count: { estimatedCostUsd: 0 },
    }),
    create: async () => {
      writeCount += 1;
      return { id: "o1" };
    },
    updateMany: async () => {
      writeCount += 1;
      return { count: 0 };
    },
  },
};

(globalThis as unknown as { prisma: unknown }).prisma = fakePrisma;

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

function post(body: unknown, withKey: boolean): Request {
  return new Request("http://localhost/api/admin/market-studies", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withKey ? { "x-admin-secret": KEY } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  const { POST, GET } = await import(
    "../src/app/api/admin/market-studies/route"
  );

  await check("GET without key → 401", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/market-studies"),
    );
    assert.equal(res.status, 401);
  });

  await check("POST without key → 401 and no writes", async () => {
    writeCount = 0;
    const res = await POST(post({ leadIds: ["lead_ok"] }, false));
    assert.equal(res.status, 401);
    assert.equal(writeCount, 0);
  });

  await check("POST empty leadIds → 400", async () => {
    const res = await POST(post({ leadIds: [] }, true));
    assert.equal(res.status, 400);
  });

  await check("POST over MAX_BATCH → 400", async () => {
    const { MARKET_STUDY_MAX_BATCH } = await import(
      "../src/lib/market-studies/constants"
    );
    const tooMany = Array.from(
      { length: MARKET_STUDY_MAX_BATCH + 1 },
      (_, i) => `l${i}`,
    );
    const res = await POST(post({ leadIds: tooMany }, true));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /max/i);
  });

  await check("POST dry-run → 200, classifies leads, ZERO writes", async () => {
    writeCount = 0;
    const res = await POST(
      post({ leadIds: ["lead_ok", "lead_noweb"] }, true),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.eligibleCount, 1);
    assert.equal(body.skippedCount, 1);
    assert.equal(body.skipped[0].leadId, "lead_noweb");
    assert.ok(body.estimatedCost && typeof body.estimatedCost.totalUsd === "number");
    assert.equal(writeCount, 0, "dry run must not write");
  });

  await check("POST confirm w/o name and w/o studyId → 400", async () => {
    const res = await POST(
      post({ leadIds: ["lead_ok"], confirm: true }, true),
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /name is required/i);
  });
}

main()
  .then(() => {
    if (failed > 0) {
      console.log(
        `[market-study-route-auth] FAILED — passed=${passed} failed=${failed}`,
      );
      for (const f of failures) console.log(f);
      process.exit(1);
    }
    console.log(`[market-study-route-auth] passed=${passed} failed=0`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
