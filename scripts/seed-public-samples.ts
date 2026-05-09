/* eslint-disable no-console */
/**
 * Seeds (or re-queues) the AuditOrder rows that power the public
 * sample-report registry — one paid+queued row per registry entry.
 *
 * Idempotent. Run as many times as you want:
 *   - First run: creates each missing row, sets reportStatus="queued",
 *     prints the order ID so you can track it in /admin/reports.
 *   - Existing row already generated → leaves it alone.
 *   - Existing row pending/failed → flips back to "queued" so the
 *     worker retries.
 *   - Existing row queued/running → leaves it alone (worker is on it).
 *
 * Each row uses a synthetic stripeSessionId (`self_audit_<slug>_<ts>`)
 * so it never collides with a real Stripe checkout. Payment is marked
 * "paid" with amount=0 so the row appears in the admin queue but
 * doesn't pollute revenue metrics. reviewStatus is pre-approved so
 * the public-sample render path doesn't need a manual review gate.
 *
 * Run with:
 *   npx tsx scripts/seed-public-samples.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { SAMPLE_REGISTRY } from "../src/lib/sample-registry";

const SHARED_EMAIL = "reports@geoviz.ai";

async function seedOne(
  prisma: PrismaClient,
  entry: (typeof SAMPLE_REGISTRY)[number],
): Promise<void> {
  const tag = `[seed-public-samples][${entry.slug}]`;
  const existing = await prisma.auditOrder.findFirst({
    where: {
      websiteUrl: { contains: entry.urlMatch, mode: "insensitive" },
      businessName: { contains: entry.businessName, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    console.log(
      `${tag} existing · id=${existing.id} reportStatus=${existing.reportStatus} createdAt=${existing.createdAt.toISOString()}`,
    );
    if (existing.reportStatus === "generated") {
      console.log(`${tag} already generated — no action.`);
      return;
    }
    if (
      existing.reportStatus === "pending" ||
      existing.reportStatus === "failed"
    ) {
      const updated = await prisma.auditOrder.update({
        where: { id: existing.id },
        data: {
          reportStatus: "queued",
          reportQueuedAt: new Date(),
          reportError: null,
        },
      });
      console.log(`${tag} re-queued · id=${updated.id}`);
      return;
    }
    console.log(`${tag} worker already on it (status=${existing.reportStatus}).`);
    return;
  }

  const stripeSessionId = `self_audit_${entry.slug}_${Date.now()}`;
  const created = await prisma.auditOrder.create({
    data: {
      stripeSessionId,
      websiteUrl: entry.publicUrl,
      email: SHARED_EMAIL,
      businessName: entry.businessName,
      amount: 0,
      currency: "usd",
      paymentStatus: "paid",
      auditStatus: "pending",
      reportStatus: "queued",
      reportQueuedAt: new Date(),
      reviewStatus: "approved",
    },
  });
  console.log(
    `${tag} created · id=${created.id} websiteUrl=${created.websiteUrl} businessName="${created.businessName}"`,
  );
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log(
      `[seed-public-samples] seeding ${SAMPLE_REGISTRY.length} registry entries`,
    );
    for (const entry of SAMPLE_REGISTRY) {
      await seedOne(prisma, entry);
    }
    console.log(
      "[seed-public-samples] done. Start the worker so it picks up the queued rows:",
    );
    console.log("    GEO_AUDIT_MODE=api npm run geo-worker:start");
    console.log(
      "[seed-public-samples] each generated audit auto-shows at /sample-report/<slug>",
    );
  } finally {
    await prisma.$disconnect().catch(() => {
      /* ignore */
    });
  }
}

main().catch((err) => {
  console.error("[seed-public-samples] FAILED:", err);
  process.exit(1);
});
