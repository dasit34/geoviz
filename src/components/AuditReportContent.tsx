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
  toCustomerHeading,
  toEvidenceFinding,
  type ReportSection,
  type ScoreDrivers,
} from "@/lib/parse-report";
import { getCanonicalScore } from "@/lib/scoring/getCanonicalScore";
import { SECTION_EYEBROWS } from "@/lib/report-sections";
import { Prose, InlineProse } from "@/components/Prose";
import { ReportScoreCard } from "@/components/ReportScoreCard";
import { ReportCtaCard } from "@/components/ReportCtaCard";
import { CategoryScoreCard } from "@/components/CategoryScoreCard";
import { StrengthCard } from "@/components/StrengthCard";
import { RadarChart } from "@/components/RadarChart";
import { AiInputsAnalyzed } from "@/components/AiInputsAnalyzed";
import { WhatAiSystemsRead } from "@/components/WhatAiSystemsRead";
import { FourModelGrid } from "@/components/FourModelGrid";
import { ConsensusSummary } from "@/components/ConsensusSummary";
import { WhyYouReceivedThisScore } from "@/components/WhyYouReceivedThisScore";
import {
  EvidenceFinding,
  EvidenceFindingFallback,
} from "@/components/EvidenceFinding";

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
/**
 * Optional benchmark + confidence context (Phase L). When provided,
 * `<ReportScoreCard />` renders a percentile + confidence pill strip
 * below the score caption, the cover page shows a cohort metadata
 * cell, and a weakest-category watch line may appear. When absent,
 * the report renders exactly as it did pre-Phase L.
 */
export type AuditReportContext = {
  /** Customer-facing percentile copy ("Top 24% among roofing audits (n=42).") */
  percentileCopy?: string | null;
  /** Cover-page cohort cell ("Top 25% (roofing)" or "Industry benchmark forming") */
  cohortCellValue?: string | null;
  /** Customer-facing confidence label ("High confidence" / "Moderate confidence" / "Limited confidence") */
  confidenceLabel?: string | null;
  /** Single-sentence reason from formatCustomerConfidence() */
  confidenceReason?: string | null;
  /** Optional "Watch:" line about the weakest category */
  weakestCategoryCopy?: string | null;
  /**
   * Cross-Model Intelligence — `AuditIntelligence.aiValidations`
   * JSON payload (ValidationLayerResult shape) and
   * `AuditIntelligence.consensusIndex` JSON payload (ConsensusIndex
   * shape). Both are null when the gate is off or validators
   * didn't run. The renderer fail-soft hides the section when both
   * are null. Typed as `unknown` because they're Prisma Json
   * columns — narrowed at render time in `<CrossModelIntelligence>`.
   */
  aiValidations?: unknown;
  consensusIndex?: unknown;
  /**
   * V2 preflight signals — `AuditIntelligence.preflightSignals`
   * JSON payload (PreflightSignals shape). Null for audits that
   * predate the V2 preflight stage. Consumed by the "AI Inputs
   * Analyzed" section. Renderer falls back to a "Not analyzed" row
   * set when null so older audits still render the section cleanly.
   */
  preflightSignals?: unknown;
};

export function AuditReportContent({
  orderId,
  businessLabel,
  websiteUrl,
  reportMarkdown,
  reportGeneratedAt,
  deterministicScore = null,
  context,
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
  /** Optional benchmark + confidence intelligence (Phase L). */
  context?: AuditReportContext;
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
          cohortCellValue={context?.cohortCellValue ?? null}
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
          </dl>
        </header>

        {/* "Search is shifting" thesis — hardcoded so the premise is
            byte-stable across every delivered audit. Sits immediately
            after the hero so the customer reads the buying premise
            before the diagnostic blocks. NOT LLM-generated; never
            drifts. */}
        <aside
          className="report-section-card mt-10"
          aria-label="Why this audit exists"
        >
          <p className="section-eyebrow">Why this audit exists</p>
          <p className="mt-4 text-base leading-relaxed text-white/80">
            Customer discovery is shifting from search results to AI
            answers. When ChatGPT, Claude, Gemini, or Perplexity
            recommends a local business, it can only cite what it
            can read, trust, and verify. This audit measures how
            clearly your business shows up inside that layer.
          </p>
        </aside>

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
            context={
              context
                ? {
                    percentileCopy: context.percentileCopy,
                    confidenceLabel: context.confidenceLabel,
                    confidenceReason: context.confidenceReason,
                    weakestCategoryCopy: context.weakestCategoryCopy,
                  }
                : undefined
            }
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

        {/* Methodology disclosure — discloses the frozen v1 rubric
            (weights), the signals fetched, and the operator-review
            step. Hardcoded React (not LLM-generated) so the values
            stay byte-stable across audits and match the frozen
            scoring constitution. Category weights mirror
            src/lib/scoring/getCanonicalScore.ts and are public-safe
            per CLAUDE.md "Scoring Freeze". */}
        <aside
          className="report-section-card mt-10"
          aria-label="How this score was built"
        >
          <p className="section-eyebrow">How this score was built</p>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            GeoViz analyzed publicly accessible website and trust
            signals — including site content, business identity
            details, structured business data, and AI-crawler
            accessibility. The composite reflects six categories
            covering AI readability, business identity verification,
            trust signals, content depth, brand presence, and
            technical accessibility. Each report is reviewed before
            delivery.
          </p>
        </aside>

        {/* Report v3 — What AI Systems Read. Quantitative metrics
            strip sitting above the categorical AiInputsAnalyzed
            checklist. Shows concrete numbers (word count, schema
            type count, sitemap depth, entity surfaces) so the
            customer sees what was actually measured, not just
            FOUND/PARTIAL pills. */}
        <WhatAiSystemsRead
          preflightSignals={context?.preflightSignals ?? null}
        />

        {/* Report v2 — AI Inputs Analyzed. Lists every AI-readable
            signal GeoViz looked at with a FOUND / PARTIAL / NOT
            FOUND verdict per row. Reads from preflightSignals when
            available; falls back to "Not analyzed" rows for older
            audits that predate preflight. */}
        <AiInputsAnalyzed
          preflightSignals={context?.preflightSignals ?? null}
        />

        {/* Report v2 — Four-Model Grid. Customer-language read of
            how each of the four AI systems interprets the business
            (per-dimension verdicts + knowledge gaps). Sits
            immediately after AI Inputs Analyzed and before Category
            Breakdown so customers see how AI systems understand
            them BEFORE they see the score breakdown. Always renders
            four cards; missing/failed providers render an explicit
            Status: Unavailable / Reason card. */}
        <FourModelGrid aiValidations={context?.aiValidations ?? null} />

        {/* Report v3 — WHY THIS MATTERS aside. Static customer-
            language explanation of why the AI Systems section is
            load-bearing for discovery. Sits between the per-system
            cards and the consensus rollup so customers read the
            "why" right after they see the per-system verdicts. */}
        <aside
          className="report-section-card mt-10"
          aria-label="Why this matters"
        >
          <p className="section-eyebrow">Why this matters</p>
          <h2 className="h2 mt-3">Why AI recommendation confidence matters.</h2>
          <p className="report-prose mt-4 text-[15px] leading-relaxed text-white/80">
            AI systems recommend businesses using the information they
            can confidently identify, verify, and trust. If key
            information is missing, inconsistent, or difficult to
            verify, AI systems may choose a competitor with stronger
            signals — even when your business is the better choice.
          </p>
        </aside>

        {/* Report v2 — AI Consensus Summary. Plain-English
            distillation of the agreement signals — what all systems
            identified, what they understood, what they couldn't
            verify. Renders the Overall AI Recommendation Confidence
            LABEL (not score). Fail-soft hidden when fewer than 2
            providers passed. */}
        <ConsensusSummary
          aiValidations={context?.aiValidations ?? null}
          consensusIndex={context?.consensusIndex ?? null}
        />

        {/* Report v2 — Why You Received This Score. Customer-language
            descriptive read of the strongest + weakest contributors.
            NOT a separate calculation. Derived from already-parsed
            categories on the score object. */}
        <WhyYouReceivedThisScore score={score} />

        {/* Category breakdown — primary score visualization. The six
            horizontal score bars are the executive-readable layer. The
            radar chart sits below as a secondary supporting visual so
            owners can also see the *shape* of their visibility once
            they've read the bars. */}
        <section className="report-section-card report-section-impact mt-10">
          <div className="report-section-card-header">
            <p className="section-eyebrow">{SECTION_EYEBROWS.categoryBreakdown}</p>
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

        {/* Cross-Model Intelligence — technical follow-on to the
            FourModelGrid + ConsensusSummary blocks rendered earlier
            (immediately after AI Inputs Analyzed). Reads from
            context.aiValidations + context.consensusIndex; fail-soft
            hidden when both are null so the report stays identical
            to its pre-gate shape for older audits. */}
        <CrossModelIntelligence
          aiValidations={context?.aiValidations ?? null}
          consensusIndex={context?.consensusIndex ?? null}
        />

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
                ? SECTION_EYEBROWS.bestCurrentSignals
                : SECTION_EYEBROWS.topStrengths}
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
  cohortCellValue,
}: {
  businessLabel: string;
  websiteUrl: string;
  overall: number | null;
  band: string;
  tone: "ok" | "warn" | "bad" | "muted";
  dateLabel: string;
  assessment: string | null;
  reportRef: string;
  /** Optional cohort cell — "Top 25% (roofing)" or "Industry benchmark forming" */
  cohortCellValue?: string | null;
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
          <dt>Review Status</dt>
          <dd>Human Reviewed</dd>
        </div>
        <div>
          <dt>Reviewed By</dt>
          <dd>GeoViz Intelligence Team</dd>
        </div>
        {cohortCellValue ? (
          <div>
            <dt>Cohort</dt>
            <dd>{cohortCellValue}</dd>
          </div>
        ) : null}
      </dl>

      <p className="report-cover-disclaimer">
        Directional assessment based on publicly accessible website and
        trust signals. Not a ranking guarantee.
      </p>
    </section>
  );
}

// Map parsed report section types to canonical eyebrow strings.
// Source of truth: `@/lib/report-sections` — shared with
// `ReportViewerClient.tsx` so admin preview and customer PDF render
// identical section numbering.
const SECTION_EYEBROWS_BY_TYPE: Record<string, string> = {
  why: SECTION_EYEBROWS.diagnosis,
  "fix-first": SECTION_EYEBROWS.actionPlan,
  happens: SECTION_EYEBROWS.businessImpact,
  "tech-details": SECTION_EYEBROWS.technicalDetails,
  other: SECTION_EYEBROWS.other,
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
      <p className="section-eyebrow">{SECTION_EYEBROWS.executiveSummary}</p>
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
  const eyebrow = SECTION_EYEBROWS_BY_TYPE[eyebrowKey] ?? `Section ${number}`;
  // Customer-language heading swap — pure render-layer translation
  // of any technical rubric labels the model may have echoed into
  // the section heading. The canonical category names in DB /
  // telemetry / scoring stay byte-stable; this only swaps the
  // display label per CLAUDE.md scoring freeze.
  const displayHeading = toCustomerHeading(heading);
  return (
    <section className={`report-section-card report-section-${tone}`}>
      <div className="report-section-card-header">
        <p className="section-eyebrow">{eyebrow}</p>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <h2 className="h2 mt-3">{displayHeading}</h2>
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

  // Report v2 — try to project the labeled fields onto the canonical
  // four-block evidence schema (What We Found / Why It Matters /
  // Business Impact / Recommended Fix). When at least one canonical
  // block matched, we render the EvidenceFinding grid. Otherwise we
  // fall back to the existing labeled-field <dl> or the raw body
  // Prose, preserving the legacy render path so nothing regresses.
  const evidence = toEvidenceFinding(fields, item.body);
  // Customer-language pass on the item title — swaps technical
  // category names if the model echoed one verbatim. Most items
  // already use natural language; this is defensive.
  const displayTitle = toCustomerHeading(item.title);

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
          <InlineProse>{displayTitle}</InlineProse>
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
      {evidence.hasStructured ? (
        <EvidenceFinding evidence={evidence} />
      ) : fields.length >= 2 ? (
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
        <EvidenceFindingFallback body={stripScoreMath(item.body)} />
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
    ? SECTION_EYEBROWS_BY_TYPE[eyebrowKey] ?? `Section ${number}`
    : SECTION_EYEBROWS_BY_TYPE.other;
  // Customer-language heading swap — pure render-layer translation.
  // See ItemListSection above for rationale.
  const displayHeading = toCustomerHeading(section.heading);
  return (
    <section className={`report-section-card report-section-${tone}`}>
      <div className="report-section-card-header">
        <p className="section-eyebrow">{eyebrow}</p>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <h2 className="h2 mt-3">{displayHeading}</h2>
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

// ────────────────────────────────────────────────────────────
// Cross-Model Intelligence — Section 03
//
// Renders per-provider validator outputs and the consensus strip.
// Reads from context.aiValidations (ValidationLayerResult shape)
// and context.consensusIndex (ConsensusIndex shape). Both are
// optional unknown; the component narrows defensively and renders
// nothing when no validator data exists (gate off, or all providers
// failed catastrophically). Never throws.
//
// Status-mapping rule (locked):
//   passed + score >= 70  → Clear
//   passed + score 40-69  → Partial
//   passed + score <  40  → Weak
//   passed + score null   → Partial (default)
//   failed | unavailable | skipped → Unavailable
// ────────────────────────────────────────────────────────────

type ValidatorOutputShape = {
  provider: string;
  status: string;
  business_understanding_score: number | null;
  category_confidence: string | null;
  service_area_confidence: string | null;
  recommendation_confidence: string | null;
  missing_facts?: string[];
  cited_sources?: string[];
  raw_summary?: string;
  error?: string | null;
};

type ConsensusShape = {
  verdict?: string;
  consensus_confidence?: string;
  model_agreement?: string;
  confidence_index?: number;
  confidence_band?: string;
};

// Keys must match the canonical PROVIDER_NAME each validator emits
// (see src/lib/validators/providers/*.ts). Claude declares "claude",
// not "anthropic"; Google AI Overview declares "google_ai_overview"
// with an underscore. Mismatches here = silent card drops.
const CROSS_MODEL_PROVIDER_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google_ai_overview: "Google AI Overview",
};

const CROSS_MODEL_PROVIDER_ORDER = [
  "openai",
  "claude",
  "gemini",
  "perplexity",
] as const;

type CardStatus = "Clear" | "Partial" | "Weak" | "Unavailable";

function crossModelCardStatus(o: ValidatorOutputShape): CardStatus {
  if (o.status !== "passed") return "Unavailable";
  const score = o.business_understanding_score;
  if (typeof score !== "number") return "Partial";
  if (score >= 70) return "Clear";
  if (score >= 40) return "Partial";
  return "Weak";
}

function crossModelStatusToneClass(s: CardStatus): string {
  switch (s) {
    case "Clear":
      return "text-severity-info";
    case "Partial":
      return "text-severity-warning";
    case "Weak":
      return "text-severity-critical";
    case "Unavailable":
      return "text-white/40";
  }
}

function crossModelFinding(o: ValidatorOutputShape): string {
  if (o.status !== "passed") {
    return o.error
      ? `Did not respond — ${clipDriverText(o.error, 60)}`
      : "Did not respond in time.";
  }
  const summary = (o.raw_summary ?? "").trim();
  return summary ? clipDriverText(summary, 110) : "Returned without a summary.";
}

function crossModelImplication(o: ValidatorOutputShape): string {
  if (o.status !== "passed") {
    return "Cross-model agreement not available for this provider.";
  }
  const confidences = [
    o.category_confidence,
    o.service_area_confidence,
    o.recommendation_confidence,
  ];
  const highs = confidences.filter((c) => c === "high").length;
  const lows = confidences.filter((c) => c === "low").length;
  if (highs >= 2) return "Can confidently identify and recommend this business.";
  if (lows >= 2)
    return "Cannot reliably recommend this business without more signal.";
  return "Can identify the business but may miss key context when recommending.";
}

function CrossModelIntelligence({
  aiValidations,
  consensusIndex,
}: {
  aiValidations: unknown;
  consensusIndex: unknown;
}) {
  // Narrow the unknown payloads defensively. Either may be null when
  // the gate is off or the providers all failed. Fail-soft: hide
  // entirely if no validator data exists.
  const layer = aiValidations as {
    outputs?: ValidatorOutputShape[];
  } | null;
  if (!layer || !Array.isArray(layer.outputs) || layer.outputs.length === 0) {
    return null;
  }

  // Index by provider name and emit in canonical display order so
  // the four cards always render ChatGPT → Claude → Gemini →
  // Perplexity left-to-right. Unknown providers are dropped (we
  // never invent a card for a name we don't recognize).
  const byProvider: Record<string, ValidatorOutputShape> = {};
  for (const o of layer.outputs) {
    if (o && typeof o.provider === "string") byProvider[o.provider] = o;
  }
  const ordered = CROSS_MODEL_PROVIDER_ORDER.map((p) => byProvider[p]).filter(
    (o): o is ValidatorOutputShape => o !== undefined,
  );
  if (ordered.length === 0) return null;

  const consensus = consensusIndex as ConsensusShape | null;
  const hasConsensus =
    consensus !== null &&
    typeof consensus === "object" &&
    typeof consensus.confidence_index === "number";

  return (
    <section className="report-section-card mt-10">
      <div className="report-section-card-header">
        <p className="section-eyebrow">
          {SECTION_EYEBROWS.crossModelIntelligence}
        </p>
        <span className="pill">{ordered.length} AI Systems</span>
      </div>
      <h2 className="h2 mt-3">How four AI systems interpret your business.</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ordered.map((o) => {
          const status = crossModelCardStatus(o);
          const display = CROSS_MODEL_PROVIDER_DISPLAY[o.provider] ?? o.provider;
          return (
            <div
              key={o.provider}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white/85">{display}</p>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${crossModelStatusToneClass(status)}`}
                >
                  {status}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-white/75">
                {crossModelFinding(o)}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                {crossModelImplication(o)}
              </p>
              {Array.isArray(o.cited_sources) && o.cited_sources.length > 0 ? (
                <p className="mt-3 inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-dim">
                  {o.cited_sources.length} source
                  {o.cited_sources.length === 1 ? "" : "s"} cited
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {hasConsensus && consensus ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-white/[0.08] bg-ink-900/40 px-4 py-3 text-[12px] text-white/65">
          {consensus.verdict ? (
            <span>
              <span className="text-white/45">Verdict:</span>{" "}
              <span className="font-semibold text-white/85">
                {consensus.verdict}
              </span>
            </span>
          ) : null}
          {consensus.model_agreement ? (
            <>
              <span aria-hidden className="text-white/20">
                ·
              </span>
              <span>
                <span className="text-white/45">Cross-model agreement:</span>{" "}
                <span className="text-white/80">
                  {consensus.model_agreement}
                </span>
              </span>
            </>
          ) : null}
          {typeof consensus.confidence_index === "number" ? (
            <>
              <span aria-hidden className="text-white/20">
                ·
              </span>
              <span className="mono-data inline-flex items-center rounded-full bg-white/[0.05] px-2 py-0.5 text-white/85">
                Confidence Index: {consensus.confidence_index}/100
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="mt-5 text-[11px] leading-relaxed text-white/45">
        The GeoViz score is deterministic. Cross-model intelligence is
        used as supporting evidence, not as the score itself.
      </p>
    </section>
  );
}
