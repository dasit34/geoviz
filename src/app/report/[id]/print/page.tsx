import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { prisma } from "@/lib/db";
import {
  bandLabelForOverall,
  cleanScoreSectionBody,
  parseReportScoreBreakdown,
  parseReportSections,
  scoreToneFromOverall,
  stripScoreMath,
  type ReportSection,
} from "@/lib/parse-report";
import { ReportScoreCard } from "@/components/ReportScoreCard";
import { ReportCtaCard } from "@/components/ReportCtaCard";
import "./print.css";

/**
 * Customer-facing audit report. Same surface that powers:
 *   1. The "View Your Report" link in the delivery email.
 *   2. The admin preview.
 *   3. Puppeteer's `/api/report/[id]/pdf` server-side render.
 *
 * The page treats the hosted view as the primary product experience —
 * matches the landing-page design language (dark canvas, orange
 * accent, premium card hierarchy) and renders each parsed section
 * inside its own styled card. Raw markdown only fills the inner body
 * of unrecognized sections so the page never collapses to plain text.
 *
 * Auth: anyone with the URL can view. 25-char cuid order IDs give
 * ~120 bits of entropy. Metadata is noindex/nofollow.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "GEO Audit Report",
  robots: { index: false, follow: false },
};

const SECTION_EYEBROWS: Record<string, string> = {
  why: "Section 02 · Diagnosis",
  "fix-first": "Section 03 · Action plan",
  happens: "Section 04 · Business impact",
  "tech-details": "Appendix · Technical details",
  other: "Section",
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
  const layout = parseReportSections(order.reportMarkdown);
  const businessLabel = order.businessName ?? order.email;
  const tone = scoreToneFromOverall(score.overall);
  const band =
    typeof score.overall === "number"
      ? bandLabelForOverall(score.overall)
      : score.status ?? "Pending";

  const scoreSection = layout.sections.find((s) => s.slug === "score");
  const whySection = layout.sections.find((s) => s.slug === "why");
  const fixSection = layout.sections.find((s) => s.slug === "fix-first");
  const happensSection = layout.sections.find((s) => s.slug === "happens");
  const techSection = layout.sections.find((s) => s.slug === "tech-details");
  const otherSections = layout.sections.filter((s) => s.slug === "other");
  const scoreProse = scoreSection
    ? cleanScoreSectionBody(scoreSection.body)
    : "";

  return (
    <div className="report-host bg-ink-950 text-white">
      <div className="bg-radial-orange pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-60" />

      <div className="container-page py-14 md:py-20">
        {/* Hero */}
        <header className="report-hero">
          <p className="section-eyebrow">GeoViz · GEO Audit Report</p>
          <h1 className="h1 mt-4 max-w-3xl">
            {businessLabel} — your AI visibility report
          </h1>
          <dl className="report-meta">
            <div>
              <dt>Site</dt>
              <dd>
                <a
                  href={order.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/85 hover:text-accent"
                >
                  {order.websiteUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>{dateLabel}</dd>
            </div>
            <div>
              <dt>Band</dt>
              <dd className={`report-band-pill report-band-pill-${tone}`}>
                {band}
              </dd>
            </div>
          </dl>
        </header>

        {/* Score card */}
        <section className="mt-10">
          <ReportScoreCard score={score} />
          {scoreProse ? (
            <div className="report-band-explainer">
              <ReactMarkdown>{scoreProse}</ReactMarkdown>
            </div>
          ) : null}
        </section>

        {/* Why customers don't see you — diagnosis card */}
        {whySection ? (
          <SectionCard
            section={whySection}
            tone="diagnosis"
            number="02"
            badge="Top 3 issues"
          />
        ) : null}

        {/* What to fix first — action checklist card */}
        {fixSection ? (
          <SectionCard
            section={fixSection}
            tone="action"
            number="03"
            badge="Top 3 fixes"
          />
        ) : null}

        {/* What happens if you fix this — impact card */}
        {happensSection ? (
          <SectionCard
            section={happensSection}
            tone="impact"
            number="04"
            badge="Business outcome"
          />
        ) : null}

        {/* Render any unrecognized "## " sections so we never lose content */}
        {otherSections.map((s, i) => (
          <SectionCard
            key={`${s.heading}-${i}`}
            section={s}
            tone="impact"
            number=""
            badge=""
          />
        ))}

        {/* CTA — premium offer card */}
        {layout.hasCta ? (
          <div className="mt-12">
            <ReportCtaCard
              orderId={order.id}
              businessLabel={businessLabel}
            />
          </div>
        ) : null}

        {/* Technical details — collapsed appendix */}
        {techSection ? (
          <details className="report-tech-details mt-10">
            <summary>
              <span className="section-eyebrow">{SECTION_EYEBROWS["tech-details"]}</span>
              <span className="report-tech-summary-title">
                {techSection.heading}
              </span>
              <span className="report-tech-summary-hint">
                Click to expand — for your developer
              </span>
            </summary>
            <div className="report-prose mt-5">
              <ReactMarkdown>{stripScoreMath(techSection.body)}</ReactMarkdown>
            </div>
          </details>
        ) : null}

        {/* Footer */}
        <footer className="report-footer">
          <div className="report-footer-brand">GeoViz</div>
          <div className="report-footer-meta">
            AI Visibility Audits for local businesses · geoviz.app
          </div>
          <div className="report-footer-id">Report ID: {order.id}</div>
        </footer>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  tone,
  number,
  badge,
}: {
  section: ReportSection;
  tone: "diagnosis" | "action" | "impact";
  number: string;
  badge: string;
}) {
  const eyebrowKey =
    tone === "diagnosis" ? "why" : tone === "action" ? "fix-first" : "happens";
  const eyebrow = number
    ? SECTION_EYEBROWS[eyebrowKey] ?? `Section ${number}`
    : SECTION_EYEBROWS.other;
  return (
    <section className={`report-section-card report-section-${tone}`}>
      <div className="report-section-card-header">
        <p className="section-eyebrow">{eyebrow}</p>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <h2 className="h2 mt-3">{section.heading}</h2>
      <div className="report-prose mt-5">
        <ReactMarkdown>{stripScoreMath(section.body)}</ReactMarkdown>
      </div>
    </section>
  );
}
