import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { prisma } from "@/lib/db";
import { parseReportScore } from "@/lib/parse-report-score";
import "./print.css";

/**
 * Print-optimized hosted view of a generated audit. Used by:
 *   1. Customers — open the link from their delivery email
 *   2. Admins — preview before sending
 *   3. Puppeteer — server-side render at /api/report/[id]/pdf
 *
 * Auth: anyone with the URL can view. Order IDs are 25-char cuids
 * (~120 bits of entropy) so practically unguessable. Metadata is
 * noindex/nofollow to prevent search-engine indexing.
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

  const dateLabel = (
    order.reportGeneratedAt ?? new Date()
  ).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const scoreInfo = parseReportScore(order.reportMarkdown);
  const scoreTone =
    scoreInfo === null
      ? "muted"
      : scoreInfo.score >= 75
        ? "ok"
        : scoreInfo.score >= 50
          ? "warn"
          : "bad";

  return (
    <div className="print-root">
      <header className="print-header">
        <div className="print-brand-row">
          <div className="print-brand">GeoViz · GEO Audit Report</div>
          {scoreInfo ? (
            <div
              className={`print-score-badge tone-${scoreTone}`}
              aria-label={`Score ${scoreInfo.score} of 100`}
            >
              <div className="print-score-num">{scoreInfo.score}</div>
              <div className="print-score-label">/ 100</div>
            </div>
          ) : null}
        </div>
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

      <footer className="print-footer">
        <div className="print-footer-brand">GeoViz</div>
        <div className="print-footer-meta">
          AI Visibility Audits for local businesses · geoviz.app
        </div>
        <div className="print-footer-id">Report ID: {order.id}</div>
      </footer>
    </div>
  );
}
