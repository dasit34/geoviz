import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { checkPageRateLimit } from "@/lib/rate-limit";
import { isSampleAudit } from "@/lib/sample-audit";
import { RateLimitedNotice } from "@/components/RateLimitedNotice";

/**
 * Bare customer-facing report URL — `/report/<orderId>`.
 *
 * The hosted, fully-styled report lives at `/report/<orderId>/print`
 * (single source of truth for both screen viewing and Puppeteer PDF
 * rendering). This page exists so the bare URL doesn't dead-end if a
 * customer trims `/print` off the link in their email.
 *
 * Auth: order ID is the access token (25-char cuid, ~120 bits).
 *
 * Security note: on the happy path this route does NOT touch the database.
 * It unconditionally redirects to `/print`, which then handles the
 * existence check and either renders the report or returns 404. That
 * collapses the previous 307-vs-404 distinction (which leaked whether
 * a CUID had a generated report) into a single 307 → 404 hop regardless
 * of whether the underlying row exists. Negligible UX cost, eliminates
 * the info-leak. (One cheap `stripeSessionId` lookup happens ONLY on the
 * rate-limited path, to let public sample reports through without a 429.)
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "GEO Audit Report",
  robots: { index: false, follow: false },
};

export default async function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  // 30 hits per 5 min per IP — accommodates a customer who opens the
  // link from the email, refreshes a few times, and re-opens later in
  // the same session. Runs BEFORE the redirect so the throttle applies
  // to whoever's hitting the bare URL, not to the downstream `/print`.
  const rl = checkPageRateLimit({
    headers: headers(),
    routeKey: "page:report:root",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (rl.blocked) {
    // Public sample reports must never 429. Only on the blocked path, do one
    // cheap lookup to let samples through; real orders stay throttled.
    const sampleProbe = await prisma.auditOrder.findUnique({
      where: { id: params.id },
      select: { stripeSessionId: true },
    });
    if (!isSampleAudit(sampleProbe?.stripeSessionId)) {
      return <RateLimitedNotice retryAfterSec={rl.retryAfterSec} />;
    }
  }
  redirect(`/report/${encodeURIComponent(params.id)}/print`);
}
