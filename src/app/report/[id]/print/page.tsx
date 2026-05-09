import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuditReportContent } from "@/components/AuditReportContent";
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
  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order || !order.reportMarkdown) notFound();

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
