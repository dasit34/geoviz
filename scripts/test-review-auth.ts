/* eslint-disable no-console */
/**
 * scripts/test-review-auth.ts
 *
 * Guards the Report QA approval route
 * (src/app/api/admin/orders/[id]/review/route.ts) against unauthorized
 * approval — the route already calls isValidAdminKey/readAdminKeyFromRequest
 * before any mutation, but had zero test coverage. This exercises the real
 * route handler directly (no live server needed — Next.js route handlers
 * are plain functions over the standard Request), against a disposable
 * fixture order, and cleans up afterward.
 *
 * Requires a live DB connection (DATABASE_URL) — same category as
 * `report:validate:live`, not a hermetic unit test.
 */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { POST } from "../src/app/api/admin/orders/[id]/review/route";

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

const TEST_ADMIN_SECRET = "test-review-auth-secret-0123456789";
const FIXTURE_SESSION_ID = `test-review-auth-${Date.now()}`;

function makeRequest(args: {
  orderId: string;
  adminSecret?: string;
  body?: Record<string, unknown>;
}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (args.adminSecret !== undefined) {
    headers.set("x-admin-secret", args.adminSecret);
  }
  return new Request(
    `http://localhost/api/admin/orders/${args.orderId}/review`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(args.body ?? {}),
    },
  );
}

async function main(): Promise<void> {
  console.log("[review-auth] running...");

  process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;

  const fixture = await prisma.auditOrder.create({
    data: {
      websiteUrl: "https://example-test-review-auth.invalid",
      email: "test-review-auth@example.invalid",
      stripeSessionId: FIXTURE_SESSION_ID,
    },
  });

  try {
    await check("missing admin key → 401, no state change", async () => {
      const res = await POST(makeRequest({ orderId: fixture.id }), {
        params: { id: fixture.id },
      });
      assert.equal(res.status, 401);
      const row = await prisma.auditOrder.findUniqueOrThrow({
        where: { id: fixture.id },
      });
      assert.equal(row.reviewStatus, "pending");
    });

    await check("wrong admin key → 401, no state change", async () => {
      const res = await POST(
        makeRequest({
          orderId: fixture.id,
          adminSecret: "definitely-not-the-secret",
          body: { reviewStatus: "approved" },
        }),
        { params: { id: fixture.id } },
      );
      assert.equal(res.status, 401);
      const row = await prisma.auditOrder.findUniqueOrThrow({
        where: { id: fixture.id },
      });
      assert.equal(row.reviewStatus, "pending");
    });

    await check(
      "empty-string admin key is treated as missing → 401",
      async () => {
        const res = await POST(
          makeRequest({
            orderId: fixture.id,
            adminSecret: "",
            body: { reviewStatus: "approved" },
          }),
          { params: { id: fixture.id } },
        );
        assert.equal(res.status, 401);
      },
    );

    await check(
      "correct admin key → succeeds, reviewStatus flips to approved",
      async () => {
        const res = await POST(
          makeRequest({
            orderId: fixture.id,
            adminSecret: TEST_ADMIN_SECRET,
            body: { reviewStatus: "approved" },
          }),
          { params: { id: fixture.id } },
        );
        assert.equal(res.status, 200);
        const json = (await res.json()) as { reviewStatus: string };
        assert.equal(json.reviewStatus, "approved");
        const row = await prisma.auditOrder.findUniqueOrThrow({
          where: { id: fixture.id },
        });
        assert.equal(row.reviewStatus, "approved");
      },
    );
  } finally {
    await prisma.auditOrder.delete({ where: { id: fixture.id } });
  }

  console.log(`[review-auth] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[review-auth] unexpected error:", err);
  process.exit(1);
});
