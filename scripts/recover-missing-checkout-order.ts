/* eslint-disable no-console */
/**
 * Recovers a completed Stripe Checkout Session that never produced an
 * AuditOrder row — e.g. a webhook delivery that never reached the
 * handler. Fetches the session (directly, or via an event id) from
 * Stripe using this process's STRIPE_SECRET_KEY, then calls the exact
 * same `createAuditOrderFromCheckoutSession` the live webhook uses — no
 * duplicated logic, and the same idempotency guarantee: safe to re-run,
 * safe to run after the webhook has already succeeded (returns
 * "already_exists" and makes no changes).
 *
 * IMPORTANT: STRIPE_SECRET_KEY must be in the same mode (test/live) as
 * the session/event being recovered. A test-mode key cannot fetch a
 * live-mode session, and vice versa — Stripe will 404.
 *
 * Usage:
 *   npx tsx scripts/recover-missing-checkout-order.ts --session=cs_...
 *   npx tsx scripts/recover-missing-checkout-order.ts --event=evt_...
 *   npx tsx scripts/recover-missing-checkout-order.ts --session=cs_... --force
 *
 * Default is a dry run: fetches from Stripe, prints what WOULD happen,
 * makes no DB writes. Pass --force to actually create/queue the order.
 */
import "dotenv/config";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { createAuditOrderFromCheckoutSession } from "../src/lib/audit-orders/create-from-checkout-session";

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const sessionArg = args.find((a) => a.startsWith("--session="));
  const eventArg = args.find((a) => a.startsWith("--event="));
  const sessionId = sessionArg ? sessionArg.slice("--session=".length) : null;
  const eventId = eventArg ? eventArg.slice("--event=".length) : null;
  return { force, sessionId, eventId };
}

async function resolveSession(
  stripe: Stripe,
  sessionId: string | null,
  eventId: string | null,
): Promise<Stripe.Checkout.Session> {
  if (sessionId) {
    return stripe.checkout.sessions.retrieve(sessionId);
  }
  if (eventId) {
    const event = await stripe.events.retrieve(eventId);
    if (event.type !== "checkout.session.completed") {
      throw new Error(
        `event ${eventId} is type "${event.type}", not "checkout.session.completed" — pass --session=<id> instead if you have the session id directly.`,
      );
    }
    return event.data.object as Stripe.Checkout.Session;
  }
  throw new Error("pass either --session=cs_... or --event=evt_...");
}

async function main(): Promise<void> {
  const { force, sessionId, eventId } = parseArgs();
  if (!sessionId && !eventId) {
    console.error(
      "[recover-missing-order] usage: --session=cs_... or --event=evt_...  (add --force to apply)",
    );
    process.exit(1);
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error("[recover-missing-order] STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }
  const keyMode = secret.startsWith("sk_live_") ? "live" : secret.startsWith("sk_test_") ? "test" : "unknown";
  console.log(`[recover-missing-order] using STRIPE_SECRET_KEY mode=${keyMode}`);

  const stripe = new Stripe(secret, { apiVersion: "2025-02-24.acacia", typescript: true });
  const prisma = new PrismaClient();

  try {
    let session: Stripe.Checkout.Session;
    try {
      session = await resolveSession(stripe, sessionId, eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[recover-missing-order] could not fetch from Stripe: ${message}`);
      console.error(
        `[recover-missing-order] if this is a live-mode session and STRIPE_SECRET_KEY here is test-mode (or vice versa), run this script wherever the matching key is available.`,
      );
      process.exit(1);
    }

    console.log(
      `[recover-missing-order] fetched session=${session.id} payment_status=${session.payment_status} amount_total=${session.amount_total} currency=${session.currency} email=${session.customer_details?.email ?? session.customer_email ?? "(none)"} metadata=${JSON.stringify(session.metadata)}`,
    );

    await prisma.$connect();
    const existing = await prisma.auditOrder.findUnique({
      where: { stripeSessionId: session.id },
    });
    if (existing) {
      console.log(
        `[recover-missing-order] AuditOrder already exists — id=${existing.id} paymentStatus=${existing.paymentStatus} reportStatus=${existing.reportStatus}. Nothing to recover, no changes made.`,
      );
      return;
    }

    console.log("[recover-missing-order] no existing AuditOrder for this session — recovery needed.");

    if (!force) {
      console.log(
        "[recover-missing-order] DRY RUN — would call createAuditOrderFromCheckoutSession() and create/queue an order. Re-run with --force to apply.",
      );
      return;
    }

    const result = await createAuditOrderFromCheckoutSession({
      id: session.id,
      metadata: session.metadata,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_details_email: session.customer_details?.email,
      customer_email: session.customer_email,
    });

    if (result.outcome === "skipped_missing_metadata") {
      console.error(
        "[recover-missing-order] session is missing required metadata (websiteUrl/email) — cannot create an order from it. This session was likely not created through GeoViz's own /api/checkout route.",
      );
      process.exit(1);
    }
    if (result.outcome === "already_exists") {
      console.log(
        `[recover-missing-order] race: order was created by something else between the check and now — id=${result.order.id}. No duplicate created.`,
      );
      return;
    }

    console.log(
      `[recover-missing-order] RECOVERED — order id=${result.order.id} paymentStatus=${result.order.paymentStatus} queued=${result.queued}. The worker will pick it up on its next poll if queued.`,
    );
  } finally {
    await prisma.$disconnect().catch(() => {
      /* ignore */
    });
  }
}

main().catch((err) => {
  console.error("[recover-missing-order] FAILED:", err);
  process.exit(1);
});
