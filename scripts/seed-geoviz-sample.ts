/* eslint-disable no-console */
/**
 * Seeds (or re-queues) the AuditOrder row that powers the public
 * `/sample-report` page — a self-audit of geoviz.ai.
 *
 * Idempotent. Run as many times as you need:
 *   - First run: creates the row, sets reportStatus="queued", prints the
 *     order ID so you can track it in /admin/reports.
 *   - Subsequent runs:
 *       • if the row exists and is already generated → prints the ID
 *         and exits (the sample is live, no work needed).
 *       • if the row exists and is pending/failed → flips it back to
 *         "queued" so the worker picks it up again.
 *       • if the row exists and is queued/running → leaves it alone.
 *
 * The row uses a synthetic `stripeSessionId` (`self_audit_geoviz_<ts>`)
 * so it never collides with a real Stripe checkout session. Payment is
 * marked "paid" with amount=0 so it shows up in the admin queue but
 * doesn't pollute revenue metrics.
 *
 * Run with:
 *   npx tsx scripts/seed-geoviz-sample.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const WEBSITE_URL = "https://www.geoviz.ai";
const BUSINESS_NAME = "GeoViz";
const EMAIL = "reports@geoviz.ai";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    // 1. Look for an existing geoviz.ai self-audit row.
    const existing = await prisma.auditOrder.findFirst({
      where: {
        websiteUrl: { contains: "geoviz.ai", mode: "insensitive" },
        businessName: { contains: "GeoViz", mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      console.log(
        `[seed-geoviz-sample] existing row found · id=${existing.id} reportStatus=${existing.reportStatus} createdAt=${existing.createdAt.toISOString()}`,
      );

      if (existing.reportStatus === "generated") {
        console.log(
          "[seed-geoviz-sample] already generated — /sample-report should render this audit. Done.",
        );
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
        console.log(
          `[seed-geoviz-sample] re-queued · id=${updated.id} reportStatus=${updated.reportStatus}`,
        );
        console.log(
          "[seed-geoviz-sample] start the worker (npm run geo-worker:start) to pick it up.",
        );
        return;
      }

      // queued or running — let the worker finish.
      console.log(
        `[seed-geoviz-sample] worker is already on it (status=${existing.reportStatus}). No action.`,
      );
      return;
    }

    // 2. No row yet — create one, paid + queued so the worker picks it up.
    const stripeSessionId = `self_audit_geoviz_${Date.now()}`;
    const created = await prisma.auditOrder.create({
      data: {
        stripeSessionId,
        websiteUrl: WEBSITE_URL,
        email: EMAIL,
        businessName: BUSINESS_NAME,
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
      `[seed-geoviz-sample] created · id=${created.id} websiteUrl=${created.websiteUrl} businessName="${created.businessName}" reportStatus=${created.reportStatus}`,
    );
    console.log(
      "[seed-geoviz-sample] next: start the worker so it picks up the queued row:",
    );
    console.log("    GEO_AUDIT_MODE=api npm run geo-worker:start");
    console.log(
      "[seed-geoviz-sample] once reportStatus=generated, /sample-report will render the real audit automatically.",
    );
  } finally {
    await prisma.$disconnect().catch(() => {
      /* ignore */
    });
  }
}

main().catch((err) => {
  console.error("[seed-geoviz-sample] FAILED:", err);
  process.exit(1);
});
