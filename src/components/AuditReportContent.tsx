import {
  cleanScoreSectionBody,
  clipDriverText,
  deriveBestCurrentSignals,
  deriveStrengths,
  extractFixMeta,
  inferFixPriority,
  inferIssueSeverity,
  parseEnumeratedItems,
  parseLabeledFields,
  parseReportSections,
  parseScoreDrivers,
  pickCleanHeroSentence,
  plainEnglishBandLabel,
  scoreToneFromOverall,
  stripScoreMath,
  type ReportSection,
  type ScoreDrivers,
} from "@/lib/parse-report";
import { getCanonicalScore } from "@/lib/scoring/getCanonicalScore";
import { Prose, InlineProse } from "@/components/Prose";
import { ReportScoreCard } from "@/components/ReportScoreCard";
import { ReportCtaCard } from "@/components/ReportCtaCard";
import { CategoryScoreCard } from "@/components/CategoryScoreCard";
import { StrengthCard } from "@/components/StrengthCard";
import { RadarChart } from "@/components/RadarChart";

/**
 * Shared report body for the customer-facing print page AND the public
 * `/sample-report` GeoViz self-audit. Pure presentation: takes the
 * data + markdown a parent has already loaded and renders the entire
 * dark-theme report body (radial overlay, hero, snapshot, score card,
 * 6 category cards, top strengths, platform visibility, issues, fixes,
 * impact, CTA, tech appendix, report-footer).
 *
 * Does NOT touch the database, do auth checks, or set page metadata —
 * those are the parent page's responsibility. Pages must also import
 * `print.css` (relative to themselves) so the styles ship with the
 * route.
 *
 * This component intentionally contains the full report shell
 * (`.report-host`, the radial overlay, container padding, footer) so
 * that it composes cleanly inside or outside marketing chrome — the
 * print page renders it standalone, the sample page renders it
 * between the marketing Header/Footer.
 */
export function AuditReportContent({
  orderId,
  businessLabel,
  websiteUrl,
  reportMarkdown,
  reportGeneratedAt,
  deterministicScore = null,
}: {
  orderId: string;
  businessLabel: string;
  websiteUrl: string;
  reportMarkdown: string;
  reportGeneratedAt: Date | null;
  /**
   * Optional — when present, the canonical resolver reads scores from
   * this `DeterministicScore` JSON (scoring@1.0.0). When absent, the
   * resolver falls back to the legacy regex parser for pre-`scoring@1.0.0`
   * rows.
   */
  deterministicScore?: unknown;
}) {
  const dateLabel = (reportGeneratedAt ?? new Date()).toLocaleDateString(
    undefined,
    { year: "numeric", month: "long", day: "numeric" },
  );

  const score = getCanonicalScore({
    reportMarkdown,
    intelligence: deterministicScore ? { deterministicScore } : null,
  });
  const layout = parseReportSections(reportMarkdown);
  const tone = scoreToneFromOverall(score.overall);
  const band =
    typeof score.overall === "number"
      ? plainEnglishBandLabel(score.overall)
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
  const heroAssessment = pickCleanHeroSentence(scoreProse);

  const issueItems = whySection ? parseEnumeratedItems(whySection.body) : [];
  const fixItems = fixSection ? parseEnumeratedItems(fixSection.body) : [];

  // Structured executive summary — extracted from the score prose so
  // the opening of the report scans as 2–3 short groups instead of a
  // dense paragraph. Capped at 3 bullets per group and each bullet
  // clipped to ~120 chars so each item targets a single desktop line
  // (mobile wraps cleanly via the flex `report-summary-item` layout).
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
  const bestSignals = strengths.length === 0
    ? deriveBestCurrentSignals(score, 3)
    : [];
  const showBestSignalsFallback = strengths.length === 0 && bestSignals.length > 0;

  // Dimensions AI cannot yet verify — REAL weak categories only
  // (parsed sub-score present AND ratio < 0.4). Surfaced as analytical
  // evidence; never fabricated, never invented when a sub-score is
  // missing (null is excluded so we don't assert a gap we can't prove).
  const unverifiedDimensions = score.categories
    .filter((c) => c.score !== null && c.score / c.max < 0.4)
    .map((c) => c.short);

  return (
    <div className="report-host bg-ink-950 text-white">
      <div className="bg-radial-orange pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-60" />

      <div className="container-page py-14 md:py-20">
        {/* Cover — premium intelligence-brief sheet. Additive; its own
            page in the PDF (page-break-after in print.css). Built only
            from already-parsed data. */}
        <ReportCover
          businessLabel={businessLabel}
          websiteUrl={websiteUrl}
          overall={score.overall}
          band={band}
          tone={tone}
          dateLabel={dateLabel}
          assessment={heroAssessment}
          reportRef={`GEO-${orderId.slice(-8).toUpperCase()}`}
        />

        {/* Hero */}
        <header className="report-hero">
          <p className="section-eyebrow">GeoViz · GEO Audit Report</p>
          <h1 className="h1 mt-4 max-w-3xl">{businessLabel}</h1>
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
              <dt>Website audited</dt>
              <dd>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/85 hover:text-accent"
                >
                  {prettifyUrlForDisplay(websiteUrl)}
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

        {/* Executive headlines — top issues + top fixes at a glance.
            The radar chart that previously lived alongside this block
            now sits as a secondary visual under the category cards
            below, so the customer's first scoring touchpoint is the
            horizontal category bars (more readable for non-technical
            owners) instead of the radar shape. */}
        {issueItems.length >= 2 || fixItems.length >= 2 ? (
          <ExecutiveAtAGlance issues={issueItems} fixes={fixItems} />
        ) : null}

        {/* Overall score card */}
        <section className="mt-12">
          <ReportScoreCard
            score={score}
            markdown={reportMarkdown}
            orderId={orderId}
            reportGeneratedAt={reportGeneratedAt}
          />
          {summaryHasContent ? (
            <ExecutiveSummaryBlock
              drivers={scoreDrivers}
              fixes={summaryFixes}
              unverified={unverifiedDimensions}
            />
          ) : null}
          <p className="report-score-consistency-note">
            The GeoViz score reflects how confidently modern AI
            systems can identify, interpret, and reference your
            business using publicly accessible website and trust
            signals. Directional — not a ranking guarantee.
          </p>
        </section>

        {/* Category breakdown — primary score visualization. The six
            horizontal score bars are the executive-readable layer. The
            radar chart sits below as a secondary supporting visual so
            owners can also see the *shape* of their visibility once
            they've read the bars. */}
        <section className="report-section-card report-section-impact mt-10">
          <div className="report-section-card-header">
            <p className="section-eyebrow">Section 02 · Category breakdown</p>
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

        {/* Top strengths (≥70%) when present; otherwise fall back to
            "Best current signals" — the top-N highest scoring categories
            with an honest caveat. The two surfaces are conditional on
            strengths.length so customers never see a negative
            "No category scored…" message in a section called Top
            Strengths. */}
        <section className="report-section-card report-section-strengths mt-10">
          <div className="report-section-card-header">
            <p className="section-eyebrow">
              {showBestSignalsFallback
                ? "Section 03 · Best current signals"
                : "Section 03 · Top strengths"}
            </p>
            {strengths.length > 0 ? (
              <span className="pill">{strengths.length} surfaced</span>
            ) : null}
          </div>
          <h2 className="h2 mt-3">
            {showBestSignalsFallback
              ? "Your strongest current signals."
              : "What's working in your favor."}
          </h2>
          {strengths.length > 0 ? (
            <div className="strength-grid mt-6">
              {strengths.map((s) => (
                <StrengthCard key={s.key} label={s.label} />
              ))}
            </div>
          ) : showBestSignalsFallback ? (
            <>
              <p className="muted mt-5 text-sm">
                These are the strongest current signals in the audit,
                even if they still need improvement.
              </p>
              <div className="strength-grid mt-6">
                {bestSignals.map((s) => (
                  <StrengthCard key={s.key} label={s.label} />
                ))}
              </div>
            </>
          ) : (
            <p className="muted mt-5 text-sm">
              Every dimension has room to grow — see Top Issues and
              Quick Fixes below.
            </p>
          )}
        </section>

        {/* Platform visibility section removed pre-launch (2026-05-15)
            — the per-platform "Visibility profile pending" rows were
            inferred from rubric tiers, not direct platform queries,
            and the placeholder copy felt unfinished in customer PDFs.
            The underlying inference now lives only in the model's
            prose (where it can name the specific missing signal)
            rather than as a dedicated section. */}

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

        {whySection &&
        fixSection &&
        issueItems.length >= 2 &&
        fixItems.length >= 2 ? (
          <p className="report-bridge-note">
            These fixes directly map to the issues above, but this section
            focuses only on action.
          </p>
        ) : null}

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

        {happensSection ? (
          <SectionCard
            section={happensSection}
            tone="impact"
            number="04"
            badge="Business outcome"
          />
        ) : null}

        {otherSections.map((s, i) => (
          <SectionCard
            key={`${s.heading}-${i}`}
            section={s}
            tone="impact"
            number=""
            badge=""
          />
        ))}

        {layout.hasCta ? (
          <div className="mt-12">
            <ReportCtaCard orderId={orderId} businessLabel={businessLabel} />
          </div>
        ) : null}

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
            <Prose className="mt-5">
              {stripScoreMath(techSection.body)}
            </Prose>
          </details>
        ) : null}

        <footer className="report-footer">
          <div className="report-footer-brand">GeoViz</div>
          <div className="report-footer-meta">
            AI Visibility Audits for local businesses · geoviz.ai
          </div>
          <div className="report-footer-id">Report ID: {orderId}</div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Premium cover sheet. Pure presentation, no fabrication — every
 * value is already-parsed report data the body also uses. In the PDF
 * this is forced onto its own page (.report-cover page-break-after in
 * print.css), so the brief opens like an intelligence document.
 */
function ReportCover({
  businessLabel,
  websiteUrl,
  overall,
  band,
  tone,
  dateLabel,
  assessment,
  reportRef,
}: {
  businessLabel: string;
  websiteUrl: string;
  overall: number | null;
  band: string;
  tone: "ok" | "warn" | "bad" | "muted";
  dateLabel: string;
  assessment: string | null;
  reportRef: string;
}) {
  const scoreLabel = typeof overall === "number" ? overall : "—";
  const displayUrl = prettifyUrlForDisplay(websiteUrl);
  return (
    <section className="report-cover" aria-label="AI visibility report cover">
      <div className="report-cover-topbar">
        <div className="report-cover-brand">
          Geo<span>Viz</span>
        </div>
        <div className="report-cover-kicker">AI Visibility Intelligence</div>
      </div>

      <div className="report-cover-headline">
        <p className="report-cover-eyebrow">AI Visibility Intelligence Report</p>
        <h1 className="report-cover-business">{businessLabel}</h1>
        <p className="report-cover-url">{displayUrl}</p>
      </div>

      <div className="report-cover-scorerow">
        <div>
          <span className={`report-cover-score report-cover-score-${tone}`}>
            {scoreLabel}
          </span>
          <span className="report-cover-score-max">/ 100</span>
        </div>
        <div className="report-cover-bandwrap">
          <span className={`report-band-pill report-band-pill-${tone}`}>
            {band}
          </span>
        </div>
      </div>

      {assessment ? (
        <p className="report-cover-assessment">{assessment}</p>
      ) : null}

      <dl className="report-cover-meta">
        <div>
          <dt>Generated</dt>
          <dd>{dateLabel}</dd>
        </div>
        <div>
          <dt>Website audited</dt>
          <dd>{displayUrl}</dd>
        </div>
        <div>
          <dt>Report ID</dt>
          <dd className="mono-data">{reportRef}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>Human-reviewed</dd>
        </div>
      </dl>

      <p className="report-cover-disclaimer">
        Directional assessment based on publicly accessible website and
        trust signals. Not a ranking guarantee.
      </p>
    </section>
  );
}

const SECTION_EYEBROWS: Record<string, string> = {
  why: "Section 04 · Diagnosis",
  "fix-first": "Section 05 · Action plan",
  happens: "Section 06 · Business impact",
  "tech-details": "Appendix · Technical details",
  other: "Section",
};

type EnumeratedItem = { title: string; body: string };

/**
 * Signal Evidence panel. Reframes the score-driver data into an
 * analytical intelligence read — what AI can use, what's missing,
 * which scored dimensions it cannot yet verify, and the recommended
 * remediation. Every item is REAL parsed data (model score drivers +
 * weak rubric categories); nothing is fabricated. This replaces — not
 * duplicates — the old executive-summary block.
 */
function ExecutiveSummaryBlock({
  drivers,
  fixes,
  unverified,
}: {
  drivers: ScoreDrivers;
  fixes: string[];
  unverified: string[];
}) {
  return (
    <div className="report-band-explainer report-summary">
      <div className="report-summary-head">
        <p className="section-eyebrow">Signal evidence</p>
        <p className="muted mt-1 text-xs">
          Derived from this audit&rsquo;s scored signals — directional,
          not fabricated telemetry.
        </p>
      </div>
      {drivers.positive.length > 0 ? (
        <div className="report-summary-group">
          <p className="report-summary-label report-summary-label-positive">
            Signals AI can use
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
            Missing retrieval signals
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
      {unverified.length > 0 ? (
        <div className="report-summary-group">
          <p className="report-summary-label report-summary-label-negative">
            Dimensions AI can&rsquo;t yet verify
          </p>
          <ul className="report-summary-list">
            {unverified.map((label, i) => (
              <li key={`unv-${i}`} className="report-summary-item">
                <span className="report-summary-marker report-summary-marker-negative">
                  ✕
                </span>
                <span className="report-summary-text">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {fixes.length > 0 ? (
        <div className="report-summary-group">
          <p className="report-summary-label report-summary-label-fix">
            Recommended remediation
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
  issues: EnumeratedItem[];
  fixes: EnumeratedItem[];
}) {
  const topIssues = issues.slice(0, 3);
  const topFixes = fixes.slice(0, 3);
  return (
    <section className="report-glance mt-10">
      <p className="section-eyebrow">Section 01 · Executive summary</p>
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
            <ItemCard
              key={`${it.title}-${i}`}
              item={it}
              index={i + 1}
              kind={itemKind}
            />
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
  item: EnumeratedItem;
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
        <span
          className={`report-item-card-icon report-item-card-icon-${kind}`}
        >
          {kind === "issue" ? <WarningIcon /> : <WrenchIcon />}
        </span>
        <span className="report-item-card-index">#{index}</span>
        <h3 className="report-item-card-title">
          <InlineProse>{item.title}</InlineProse>
        </h3>
      </div>
      <div className="report-item-card-badges">
        {kind === "issue" && inferredIssueSeverity ? (
          <span
            className={`severity-badge severity-${inferredIssueSeverity.tone}`}
          >
            {inferredIssueSeverity.label}
          </span>
        ) : null}
        {kind === "fix" && meta?.priority ? (
          <span className={`severity-badge severity-${meta.priority.tone}`}>
            {meta.priority.label}
          </span>
        ) : kind === "fix" && inferredFix ? (
          <span
            className={`severity-badge severity-${inferredFix.severity.tone}`}
          >
            {inferredFix.severity.label}
          </span>
        ) : null}
        {kind === "fix" && meta?.difficulty ? (
          <span
            className={`severity-badge difficulty-${meta.difficulty.tone}`}
          >
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
      <Prose className="mt-5">{stripScoreMath(section.body)}</Prose>
    </section>
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

/**
 * Strips protocol + trailing slash from a URL for premium hero
 * display — `https://www.geoviz.ai/` becomes `www.geoviz.ai`. The
 * full URL stays on the anchor's `href` so click-through still
 * lands on the original target. Falls back to the raw string when
 * the input isn't parseable as a URL.
 */
function prettifyUrlForDisplay(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname}${path}${u.search}`.replace(/\/+$/, "");
  } catch {
    return url;
  }
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
