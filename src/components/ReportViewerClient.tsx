"use client";

import { useState } from "react";
import {
  cleanScoreSectionBody,
  clipDriverText,
  derivePlatformVisibility,
  deriveStrengths,
  extractFixMeta,
  inferFixPriority,
  inferIssueSeverity,
  parseEnumeratedItems,
  parseLabeledFields,
  parseReportScoreBreakdown,
  parseReportSections,
  parseScoreDrivers,
  stripScoreMath,
  type ScoreDrivers,
} from "@/lib/parse-report";
import { Prose, InlineProse } from "./Prose";
import { ReportScoreCard } from "./ReportScoreCard";
import { ReportCtaCard } from "./ReportCtaCard";
import { CategoryScoreCard } from "./CategoryScoreCard";
import { StrengthCard } from "./StrengthCard";
import { PlatformVisibilityRow } from "./PlatformVisibilityRow";
import { RadarChart } from "./RadarChart";
import "@/app/report/[id]/print/print.css";

/**
 * Admin-facing report preview. Mirrors the customer-facing print
 * page exactly — same score card, same section cards, same
 * AI Visibility Profile Setup card — so the admin preview shows what the
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
  // Mirror the customer-page caps so the admin preview matches what
  // ships: ≤ 3 bullets per group, ≤ 120 chars per bullet.
  const SUMMARY_PER_GROUP_LIMIT = 3;
  const SUMMARY_BULLET_CHAR_LIMIT = 120;
  const rawDrivers = parseScoreDrivers(scoreProse);
  const scoreDrivers: ScoreDrivers = {
    positive: rawDrivers.positive
      .slice(0, SUMMARY_PER_GROUP_LIMIT)
      .map((s) => clipDriverText(s, SUMMARY_BULLET_CHAR_LIMIT)),
    negative: rawDrivers.negative
      .slice(0, SUMMARY_PER_GROUP_LIMIT)
      .map((s) => clipDriverText(s, SUMMARY_BULLET_CHAR_LIMIT)),
  };
  const summaryFixes = fixItems
    .slice(0, SUMMARY_PER_GROUP_LIMIT)
    .map((f) => clipDriverText(f.title, SUMMARY_BULLET_CHAR_LIMIT));
  const summaryHasContent =
    scoreDrivers.positive.length > 0 ||
    scoreDrivers.negative.length > 0 ||
    summaryFixes.length > 0;
  const strengths = deriveStrengths(score);
  const platforms = derivePlatformVisibility(markdown, score);

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

          <div className="mt-12">
            <ReportScoreCard score={score} markdown={markdown} />
          </div>
          {summaryHasContent ? (
            <ExecutiveSummaryBlock
              drivers={scoreDrivers}
              fixes={summaryFixes}
            />
          ) : null}
          <p className="report-score-consistency-note">
            Scores are directional benchmarks based on publicly
            accessible AI-search signals.
          </p>

          {/* Category breakdown — primary, with radar as secondary support. */}
          <section className="report-section-card report-section-impact mt-10">
            <div className="report-section-card-header">
              <p className="section-eyebrow">
                Section 02 · Category breakdown
              </p>
              <span className="pill">6 dimensions scored</span>
            </div>
            <h2 className="h2 mt-3">Where the score comes from.</h2>
            <div className="category-score-grid mt-6">
              {score.categories.map((cat) => (
                <CategoryScoreCard key={cat.key} category={cat} />
              ))}
            </div>
            <div className="category-score-radar-wrap mt-8">
              <p className="category-score-radar-label">
                Score distribution at a glance
              </p>
              <RadarChart categories={score.categories} />
            </div>
          </section>

          {/* Top strengths — derived from category scores ≥ 70% */}
          <section className="report-section-card report-section-strengths mt-10">
            <div className="report-section-card-header">
              <p className="section-eyebrow">Section 03 · Top strengths</p>
              {strengths.length > 0 ? (
                <span className="pill">{strengths.length} surfaced</span>
              ) : null}
            </div>
            <h2 className="h2 mt-3">What&rsquo;s working in your favor.</h2>
            {strengths.length > 0 ? (
              <div className="strength-grid mt-6">
                {strengths.map((s) => (
                  <StrengthCard key={s.key} label={s.label} />
                ))}
              </div>
            ) : (
              <p className="muted mt-5 text-sm">
                No category scored at least 70% of its maximum. Every
                dimension has room to grow — see Top Issues and Quick
                Fixes below.
              </p>
            )}
          </section>

          {/* Platform visibility — four fixed rows */}
          <section className="report-section-card report-section-impact mt-10">
            <div className="report-section-card-header">
              <p className="section-eyebrow">
                Section 04 · Platform visibility
              </p>
              <span className="pill">
                ChatGPT · Claude · Gemini · Perplexity
              </span>
            </div>
            <h2 className="h2 mt-3">
              How AI systems may interpret this site.
            </h2>
            <p className="muted mt-3 max-w-2xl text-sm">
              A short interpretive read of how each platform is
              positioned to find, parse, and confidently recommend your
              business.
            </p>
            <div className="platform-list mt-6">
              {platforms.map((p) => (
                <PlatformVisibilityRow key={p.platform} status={p} />
              ))}
            </div>
          </section>

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
              <Prose className="mt-5">{stripScoreMath(techSection.body)}</Prose>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}

type EnumItem = { title: string; body: string };

function ExecutiveSummaryBlock({
  drivers,
  fixes,
}: {
  drivers: ScoreDrivers;
  fixes: string[];
}) {
  return (
    <div className="report-band-explainer report-summary">
      {drivers.positive.length > 0 ? (
        <div className="report-summary-group">
          <p className="report-summary-label report-summary-label-positive">
            Strong signals
          </p>
          <ul className="report-summary-list">
            {drivers.positive.map((item, i) => (
              <li key={`pos-${i}`} className="report-summary-item">
                <span className="report-summary-marker report-summary-marker-positive">
                  ✓
                </span>
                <span className="report-summary-text">
                  <InlineProse>{item}</InlineProse>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {drivers.negative.length > 0 ? (
        <div className="report-summary-group">
          <p className="report-summary-label report-summary-label-negative">
            Biggest visibility gaps
          </p>
          <ul className="report-summary-list">
            {drivers.negative.map((item, i) => (
              <li key={`neg-${i}`} className="report-summary-item">
                <span className="report-summary-marker report-summary-marker-negative">
                  ✕
                </span>
                <span className="report-summary-text">
                  <InlineProse>{item}</InlineProse>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {fixes.length > 0 ? (
        <div className="report-summary-group">
          <p className="report-summary-label report-summary-label-fix">
            Fastest recommended fixes
          </p>
          <ul className="report-summary-list">
            {fixes.map((title, i) => (
              <li key={`fix-${i}`} className="report-summary-item">
                <span className="report-summary-marker report-summary-marker-fix">
                  →
                </span>
                <span className="report-summary-text">
                  <InlineProse>{title}</InlineProse>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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
                    <span className="report-glance-title">
                      <InlineProse>{it.title}</InlineProse>
                    </span>
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
                    <span className="report-glance-title">
                      <InlineProse>{it.title}</InlineProse>
                    </span>
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
        <Prose className="mt-5">{stripScoreMath(fallbackBody)}</Prose>
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
        <h3 className="report-item-card-title">
          <InlineProse>{item.title}</InlineProse>
        </h3>
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
            GeoViz Profile Setup: {meta.foundationFix.label}
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
              <dd>
                <InlineProse>{f.content}</InlineProse>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <Prose className="report-item-card-body">
          {stripScoreMath(item.body)}
        </Prose>
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
      <Prose className="mt-5">{stripScoreMath(body)}</Prose>
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
