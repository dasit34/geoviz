import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { AuditReportContent } from "@/components/AuditReportContent";
import { logReportAccessAttempt } from "@/lib/report-access";
import { checkPageRateLimit } from "@/lib/rate-limit";
import { RateLimitedNotice } from "@/components/RateLimitedNotice";
import "./print.css";

/**
 * Customer-facing audit report. Same surface that powers:
 *   1. The "View Your Report" link in the delivery email.
 *   2. The admin preview.
 *   3. Puppeteer's `/api/report/[id]/pdf` server-side render.
 *
 * Auth: anyone with the URL can view. 25-char cuid order IDs give
 * ~120 bits of entropy. Metadata is noindex/nofollow.
 *
 * The actual report body lives in <AuditReportContent /> so that the
 * public `/sample-report` page (the GeoViz self-audit preview) can
 * render the exact same template against a different audit row
 * without forking the design.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "GEO Audit Report",
  robots: { index: false, follow: false },
};

export default async function PrintPage({
  params,
}: {
  params: { id: string };
}) {
  // 30 hits per 5 min per IP. Throttle BEFORE the Prisma lookup so a
  // script can't churn `findUnique` calls fishing for CUIDs.
  const rl = checkPageRateLimit({
    headers: headers(),
    routeKey: "page:report:print",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (rl.blocked) {
    return <RateLimitedNotice retryAfterSec={rl.retryAfterSec} />;
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order || !order.reportMarkdown) {
    logReportAccessAttempt({
      route: "/report/[id]/print",
      orderId: params.id,
      outcome: "not_found",
      reason: !order ? "no_order_row" : "no_report_markdown",
    });
    notFound();
  }

  const businessLabel = order.businessName ?? order.email;

  return (
    <AuditReportContent
      orderId={order.id}
      businessLabel={businessLabel}
      websiteUrl={order.websiteUrl}
      reportMarkdown={order.reportMarkdown}
      reportGeneratedAt={order.reportGeneratedAt}
    />
  );
}
