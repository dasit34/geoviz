import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { prisma } from "@/lib/db";
import {
  bandLabelForOverall,
  cleanScoreSectionBody,
  inferFixPriority,
  inferIssueSeverity,
  parseEnumeratedItems,
  parseLabeledFields,
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
  // First sentence of the score prose becomes the hero one-liner.
  const heroAssessment = scoreProse.split(/(?<=[.!?])\s/).find((s) =>
    s.trim().length > 12,
  );

  const issueItems = whySection ? parseEnumeratedItems(whySection.body) : [];
  const fixItems = fixSection ? parseEnumeratedItems(fixSection.body) : [];

  return (
    <div className="report-host bg-ink-950 text-white">
      <div className="bg-radial-orange pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-60" />

      <div className="container-page py-14 md:py-20">
        {/* Hero */}
        <header className="report-hero">
          <p className="section-eyebrow">GeoViz · GEO Audit Report</p>
          <h1 className="h1 mt-4 max-w-3xl">
            {businessLabel}
          </h1>
          <p className="report-hero-subtitle">
            Your AI Visibility Report —{" "}
            <span className={`report-band-inline report-band-inline-${tone}`}>
              {band}
            </span>
          </p>
          {heroAssessment ? (
            <p className="report-hero-assessment">{heroAssessment}</p>
          ) : null}
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
              <dt>Status</dt>
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

        {/* Why customers don't see you — issue cards */}
        {whySection ? (
          <ItemListSection
            heading={whySection.heading}
            items={issueItems}
            fallbackBody={whySection.body}
            tone="diagnosis"
            number="02"
            badge="Top 3 issues"
            itemKind="issue"
          />
        ) : null}

        {/* What to fix first — checklist cards */}
        {fixSection ? (
          <ItemListSection
            heading={fixSection.heading}
            items={fixItems}
            fallbackBody={fixSection.body}
            tone="action"
            number="03"
            badge="Top 3 fixes"
            itemKind="fix"
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

        {/* Technical Details (Advanced) — collapsed appendix */}
        {techSection ? (
          <details className="report-tech-details mt-12">
            <summary>
              <span className="section-eyebrow">Appendix</span>
              <span className="report-tech-summary-title">
                Technical Details (Advanced)
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

type EnumeratedItem = { title: string; body: string };

function ItemListSection({
  heading,
  items,
  fallbackBody,
  tone,
  number,
  badge,
  itemKind,
}: {
  heading: string;
  items: EnumeratedItem[];
  fallbackBody: string;
  tone: "diagnosis" | "action";
  number: string;
  badge: string;
  itemKind: "issue" | "fix";
}) {
  const eyebrowKey = tone === "diagnosis" ? "why" : "fix-first";
  const eyebrow = SECTION_EYEBROWS[eyebrowKey] ?? `Section ${number}`;
  return (
    <section className={`report-section-card report-section-${tone}`}>
      <div className="report-section-card-header">
        <p className="section-eyebrow">{eyebrow}</p>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <h2 className="h2 mt-3">{heading}</h2>
      {items.length >= 2 ? (
        <ol className="report-item-list">
          {items.map((it, i) => (
            <ItemCard key={`${it.title}-${i}`} item={it} index={i + 1} kind={itemKind} />
          ))}
        </ol>
      ) : (
        <div className="report-prose mt-5">
          <ReactMarkdown>{stripScoreMath(fallbackBody)}</ReactMarkdown>
        </div>
      )}
    </section>
  );
}

function ItemCard({
  item,
  index,
  kind,
}: {
  item: EnumeratedItem;
  index: number;
  kind: "issue" | "fix";
}) {
  const fields = parseLabeledFields(item.body);
  const severity =
    kind === "issue"
      ? inferIssueSeverity(item.title, item.body)
      : inferFixPriority(item.title, item.body).severity;
  const fix = kind === "fix" ? inferFixPriority(item.title, item.body) : null;
  return (
    <li className={`report-item-card report-item-card-${kind}`}>
      <div className="report-item-card-head">
        <span className={`report-item-card-icon report-item-card-icon-${kind}`}>
          {kind === "issue" ? <WarningIcon /> : <WrenchIcon />}
        </span>
        <span className="report-item-card-index">#{index}</span>
        <h3 className="report-item-card-title">{item.title}</h3>
      </div>
      <div className="report-item-card-badges">
        <span className={`severity-badge severity-${severity.tone}`}>
          {severity.label}
        </span>
        {fix ? (
          <>
            <span className="severity-badge severity-priority">
              {fix.priority}
            </span>
            <span className="severity-badge severity-impact">
              Estimated impact: {fix.impactLabel}
            </span>
          </>
        ) : null}
      </div>
      {fields.length >= 2 ? (
        <dl className="report-item-card-fields">
          {fields.map((f, i) => (
            <div className="report-item-card-field" key={`${f.label}-${i}`}>
              <dt>{f.label}</dt>
              <dd>{f.content}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="report-prose report-item-card-body">
          <ReactMarkdown>{stripScoreMath(item.body)}</ReactMarkdown>
        </div>
      )}
    </li>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d="M10 2 L18.5 17 L1.5 17 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 8 L10 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d="M14.5 5 a3 3 0 0 0 -3.6 3.6 L4.5 15 a1.4 1.4 0 0 0 2 2 l6.4 -6.4 a3 3 0 0 0 3.6 -3.6 l-1.7 1.7 -1.4 0 0 -1.4 z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
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
