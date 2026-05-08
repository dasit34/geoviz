"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  cleanScoreSectionBody,
  extractFixMeta,
  inferFixPriority,
  inferIssueSeverity,
  parseEnumeratedItems,
  parseLabeledFields,
  parseReportScoreBreakdown,
  parseReportSections,
  stripScoreMath,
} from "@/lib/parse-report";
import { ReportScoreCard } from "./ReportScoreCard";
import { ReportCtaCard } from "./ReportCtaCard";
import "@/app/report/[id]/print/print.css";

/**
 * Admin-facing report preview. Mirrors the customer-facing print
 * page exactly — same score card, same section cards, same
 * Foundation Fix card — so the admin preview shows what the
 * customer sees in their email link / PDF. Toggle to raw markdown
 * when triaging audit output.
 */
export function ReportViewerClient({
  markdown,
  orderId,
  businessLabel,
}: {
  markdown: string;
  orderId?: string;
  businessLabel?: string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const score = parseReportScoreBreakdown(markdown);
  const layout = parseReportSections(markdown);

  const scoreSection = layout.sections.find((s) => s.slug === "score");
  const whySection = layout.sections.find((s) => s.slug === "why");
  const fixSection = layout.sections.find((s) => s.slug === "fix-first");
  const happensSection = layout.sections.find((s) => s.slug === "happens");
  const techSection = layout.sections.find((s) => s.slug === "tech-details");
  const otherSections = layout.sections.filter((s) => s.slug === "other");
  const scoreProse = scoreSection
    ? cleanScoreSectionBody(scoreSection.body)
    : "";
  const issueItems = whySection ? parseEnumeratedItems(whySection.body) : [];
  const fixItems = fixSection ? parseEnumeratedItems(fixSection.body) : [];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">
          {showRaw ? "Raw markdown" : "Rendered report"} ·{" "}
          {markdown.length.toLocaleString()} chars
        </p>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/80 hover:border-accent/40 hover:text-accent"
        >
          {showRaw ? "Show rendered" : "Show raw markdown"}
        </button>
      </div>

      {showRaw ? (
        <pre className="max-h-[700px] overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-6 text-xs leading-relaxed text-white/80 whitespace-pre-wrap">
{markdown}
        </pre>
      ) : (
        <div className="report-host bg-ink-950 text-white -mx-6 -my-6 md:-mx-8 md:-my-8 px-6 py-6 md:px-8 md:py-8 rounded-lg">
          {issueItems.length >= 2 || fixItems.length >= 2 ? (
            <ExecutiveAtAGlance issues={issueItems} fixes={fixItems} />
          ) : null}
          <div className="mt-6">
            <ReportScoreCard score={score} markdown={markdown} />
          </div>
          {scoreProse ? (
            <div className="report-band-explainer">
              <ReactMarkdown>{scoreProse}</ReactMarkdown>
            </div>
          ) : null}
          <p className="report-score-consistency-note">
            Scores may vary slightly as pages, crawlability, and
            available signals change.
          </p>

          {whySection ? (
            <ItemListSection
              heading={whySection.heading}
              items={issueItems}
              fallbackBody={whySection.body}
              tone="diagnosis"
              badge="Top 3 issues"
              eyebrow="Section 02 · Diagnosis"
              itemKind="issue"
            />
          ) : null}

          {whySection && fixSection && issueItems.length >= 2 && fixItems.length >= 2 ? (
            <p className="report-bridge-note">
              These fixes directly map to the issues above, but this
              section focuses only on action.
            </p>
          ) : null}

          {fixSection ? (
            <ItemListSection
              heading={fixSection.heading}
              items={fixItems}
              fallbackBody={fixSection.body}
              tone="action"
              badge="Top 3 fixes"
              eyebrow="Section 03 · Action plan"
              itemKind="fix"
            />
          ) : null}

          {happensSection ? (
            <SimpleSectionCard
              heading={happensSection.heading}
              body={happensSection.body}
              tone="impact"
              badge="Business outcome"
              eyebrow="Section 04 · Business impact"
            />
          ) : null}

          {otherSections.map((s, i) => (
            <SimpleSectionCard
              key={`${s.heading}-${i}`}
              heading={s.heading}
              body={s.body}
              tone="impact"
              badge=""
              eyebrow="Section"
            />
          ))}

          {layout.hasCta ? (
            <div className="mt-12">
              <ReportCtaCard
                orderId={orderId ?? "preview"}
                businessLabel={businessLabel ?? "your business"}
              />
            </div>
          ) : null}

          {techSection ? (
            <details className="report-tech-details mt-10">
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
        </div>
      )}
    </div>
  );
}

type EnumItem = { title: string; body: string };

function ExecutiveAtAGlance({
  issues,
  fixes,
}: {
  issues: EnumItem[];
  fixes: EnumItem[];
}) {
  const topIssues = issues.slice(0, 3);
  const topFixes = fixes.slice(0, 3);
  return (
    <section className="report-glance">
      <p className="section-eyebrow">At a glance</p>
      <h2 className="h3 mt-2">The headlines from this audit.</h2>
      <div className="report-glance-grid mt-5">
        {topIssues.length > 0 ? (
          <div>
            <p className="report-glance-col-label">Top 3 issues</p>
            <ol className="report-glance-list">
              {topIssues.map((it, i) => {
                const sev = inferIssueSeverity(it.title, it.body);
                return (
                  <li key={`issue-${i}`} className="report-glance-row">
                    <span className="report-glance-index">#{i + 1}</span>
                    <span className="report-glance-title">{it.title}</span>
                    <span
                      className={`severity-badge severity-${sev.tone} report-glance-badge`}
                    >
                      {sev.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {topFixes.length > 0 ? (
          <div>
            <p className="report-glance-col-label">Top 3 fixes</p>
            <ol className="report-glance-list">
              {topFixes.map((it, i) => {
                const fix = inferFixPriority(it.title, it.body);
                return (
                  <li key={`fix-${i}`} className="report-glance-row">
                    <span className="report-glance-index">#{i + 1}</span>
                    <span className="report-glance-title">{it.title}</span>
                    <span
                      className={`severity-badge severity-${fix.severity.tone} report-glance-badge`}
                    >
                      {fix.severity.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ItemListSection({
  heading,
  items,
  fallbackBody,
  tone,
  badge,
  eyebrow,
  itemKind,
}: {
  heading: string;
  items: EnumItem[];
  fallbackBody: string;
  tone: "diagnosis" | "action";
  badge: string;
  eyebrow: string;
  itemKind: "issue" | "fix";
}) {
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
  item: EnumItem;
  index: number;
  kind: "issue" | "fix";
}) {
  const allFields = parseLabeledFields(item.body);
  const meta = kind === "fix" ? extractFixMeta(allFields) : null;
  const fields = meta ? meta.rest : allFields;

  const inferredFix =
    kind === "fix" ? inferFixPriority(item.title, item.body) : null;
  const inferredIssueSeverity =
    kind === "issue" ? inferIssueSeverity(item.title, item.body) : null;

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
        {kind === "issue" && inferredIssueSeverity ? (
          <span className={`severity-badge severity-${inferredIssueSeverity.tone}`}>
            {inferredIssueSeverity.label}
          </span>
        ) : null}
        {kind === "fix" && meta?.priority ? (
          <span className={`severity-badge severity-${meta.priority.tone}`}>
            {meta.priority.label}
          </span>
        ) : kind === "fix" && inferredFix ? (
          <span className={`severity-badge severity-${inferredFix.severity.tone}`}>
            {inferredFix.severity.label}
          </span>
        ) : null}
        {kind === "fix" && meta?.difficulty ? (
          <span className={`severity-badge difficulty-${meta.difficulty.tone}`}>
            Difficulty: {meta.difficulty.label}
          </span>
        ) : null}
        {kind === "fix" && meta?.foundationFix ? (
          <span
            className={`severity-badge foundation-${meta.foundationFix.yes ? "yes" : "no"}`}
          >
            GeoViz Foundation Fix: {meta.foundationFix.label}
          </span>
        ) : null}
        {kind === "fix" && !meta?.priority && inferredFix ? (
          <span className="severity-badge severity-impact">
            Estimated impact: {inferredFix.impactLabel}
          </span>
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

function SimpleSectionCard({
  heading,
  body,
  tone,
  badge,
  eyebrow,
}: {
  heading: string;
  body: string;
  tone: "diagnosis" | "action" | "impact";
  badge: string;
  eyebrow: string;
}) {
  return (
    <section className={`report-section-card report-section-${tone}`}>
      <div className="report-section-card-header">
        <p className="section-eyebrow">{eyebrow}</p>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <h2 className="h2 mt-3">{heading}</h2>
      <div className="report-prose mt-5">
        <ReactMarkdown>{stripScoreMath(body)}</ReactMarkdown>
      </div>
    </section>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M10 2 L18.5 17 L1.5 17 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8 L10 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
