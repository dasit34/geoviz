import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { prisma } from "@/lib/db";
import { isValidAdminKey } from "@/lib/admin-secret";
import "./print.css";

/**
 * Print-optimized rendering of a generated audit. Used by:
 *   1. Admins who want a printable preview (load with ?key=ADMIN_SECRET)
 *   2. The Puppeteer PDF generator at /api/report/[id]/pdf, which loads
 *      this page server-to-server and prints it.
 *
 * Forces light theme and clean typography. No header / footer chrome,
 * no buttons, no markdown raw text — just the report.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "GEO Audit Report",
  robots: { index: false, follow: false },
};

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { key?: string };
}) {
  if (!isValidAdminKey(searchParams?.key)) notFound();

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order || !order.reportMarkdown) notFound();

  const dateLabel = (
    order.reportGeneratedAt ?? new Date()
  ).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="print-root">
      <header className="print-header">
        <div className="print-brand">GeoViz · GEO Audit Report</div>
        <dl className="print-meta">
          <div>
            <dt>Business</dt>
            <dd>{order.businessName ?? order.email}</dd>
          </div>
          <div>
            <dt>Site</dt>
            <dd>{order.websiteUrl}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{dateLabel}</dd>
          </div>
        </dl>
      </header>
      <article className="print-prose">
        <ReactMarkdown>{order.reportMarkdown}</ReactMarkdown>
      </article>
    </div>
  );
}
