import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { prisma } from "@/lib/db";
import {
  parseReportScoreBreakdown,
  scoreToneFromOverall,
  splitReportLayout,
} from "@/lib/parse-report";
import { ReportScoreCard } from "@/components/ReportScoreCard";
import { ReportCtaCard } from "@/components/ReportCtaCard";
import "./print.css";

/**
 * Print-optimized hosted view of a generated audit. Used by:
 *   1. Customers — open the link from their delivery email
 *   2. Admins — preview before sending
 *   3. Puppeteer — server-side render at /api/report/[id]/pdf
 *
 * The page replaces two raw-markdown sections with styled UI so the
 * report doesn't look like raw markdown:
 *   - The score section becomes a `<ReportScoreCard>` (overall + risk
 *     label + per-category bars).
 *   - The "Done-For-You Fix" section becomes a `<ReportCtaCard>`
 *     (offer panel with headline, badges, checkmarked bullets, and a
 *     mailto CTA). Surrounding markdown chunks render normally so we
 *     never lose the rest of the report.
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

  const score = parseReportScoreBreakdown(order.reportMarkdown);
  const layout = splitReportLayout(order.reportMarkdown);
  const businessLabel = order.businessName ?? order.email;
  const headerTone = scoreToneFromOverall(score.overall);

  return (
    <div className="print-root">
      <header className="print-header">
        <div className="print-brand-row">
          <div className="print-brand">GeoViz · GEO Audit Report</div>
          {typeof score.overall === "number" ? (
            <div
              className={`print-score-badge tone-${headerTone}`}
              aria-label={`Score ${score.overall} of 100`}
            >
              <div className="print-score-num">{score.overall}</div>
              <div className="print-score-label">/ 100</div>
            </div>
          ) : null}
        </div>
        <dl className="print-meta">
          <div>
            <dt>Business</dt>
            <dd>{businessLabel}</dd>
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

      <ReportScoreCard score={score} />

      <article className="print-prose">
        <ReactMarkdown>{layout.before}</ReactMarkdown>
      </article>

      {layout.hasCta ? (
        <ReportCtaCard orderId={order.id} businessLabel={businessLabel} />
      ) : null}

      {layout.after.trim() ? (
        <article className="print-prose">
          <ReactMarkdown>{layout.after}</ReactMarkdown>
        </article>
      ) : null}

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
