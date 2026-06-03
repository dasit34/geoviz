import {
  cleanScoreSectionBody,
  clipDriverText,
  formatBusinessName,
  extractFixMeta,
  inferFixPriority,
  inferIssueSeverity,
  parseEnumeratedItems,
  parseLabeledFields,
  parseReportSections,
  stripFabricatedGeography,
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
import { formatDisplayScore } from "@/lib/scoring/format-score";
import { SECTION_EYEBROWS } from "@/lib/report-sections";
import { Prose, InlineProse } from "@/components/Prose";
import { ReportScoreCard } from "@/components/ReportScoreCard";
import { ReportCtaCard } from "@/components/ReportCtaCard";
import { CategoryScoreCard } from "@/components/CategoryScoreCard";
import { RadarChart } from "@/components/RadarChart";
import { ConsensusActionAnchor } from "@/components/ConsensusActionAnchor";
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
  /**
   * F2 — populated when the rendered business name diverges from
   * `order.businessName`. Cover surfaces both names so the customer
   * sees the conflict instead of having their input silently
   * overwritten.
   */
  nameInconsistency?: {
    primary: string;
    alternates: string[];
  } | null;
};

export function AuditReportContent({
  orderId,
  businessLabel: rawBusinessLabel,
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

  // Launch Blocker P1 #2 — normalize the business name once at the
  // top of the component. Every downstream render site reads from
  // `businessLabel` (the Title-Cased value), never `rawBusinessLabel`.
  // Customer-entered names like "acme plumbing" become "Acme Plumbing"
  // before they reach the cover, hero, AI System cards, consensus,
  // CTA, or anywhere else in the report.
  const businessLabel = formatBusinessName(rawBusinessLabel);

  const score = getCanonicalScore({
    reportMarkdown,
    intelligence: deterministicScore ? { deterministicScore } : null,
  });
  const rawLayout = parseReportSections(reportMarkdown);
  // Phase B4 — strip fabricated city / locality references from every
  // section's prose body before render. Compares against the
  // cross-model validator consensus on `location_identified`. Logs
  // one telemetry line per section that gets scrubbed.
  const layout = {
    ...rawLayout,
    sections: rawLayout.sections.map((s) => ({
      ...s,
      body: stripFabricatedGeography(
        s.body,
        (context?.aiValidations ?? null) as Parameters<
          typeof stripFabricatedGeography
        >[1],
        rawBusinessLabel,
        { logTag: `${orderId}:${s.slug}` },
      ),
    })),
  };
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
  // Launch Blocker P1 #3 — bumped from 120 → 280 chars per bullet.
  // The Signal Evidence section carries the strongest concrete
  // evidence in the report (missing entity fields, varying business
  // names, exact word counts). 120 was clipping these mid-sentence
  // with "…" — the customer's most valuable read was being cut.
  // 280 captures full sentences while still bounding extreme outputs.
  const SUMMARY_PER_GROUP_LIMIT = 3;
  const SUMMARY_BULLET_CHAR_LIMIT = 280;
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

  // Phase E — strengths / bestSignals / unverifiedDimensions all
  // consumed by the (now removed) Top Strengths and ExecutiveSummary
  // sections. WhyYouReceivedThisScore derives the same data
  // internally, so the local computations here are no longer needed.

  return (
    <div className="report-host bg-ink-950 text-white">
      <div className="bg-radial-orange pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-60" />

      <div className="container-page py-14 md:py-20">
        {/* Cover — premium intelligence-brief sheet. Additive; its own
            page in the PDF (page-break-after in print.css). Built only
            from already-parsed data. */}
        <ReportCover
          businessLabel={businessLabel}
          nameInconsistency={context?.nameInconsistency ?? null}
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

        {/* Phase E — "Why this audit exists" aside removed: it was a
            hardcoded marketing premise that duplicated "Why this
            matters" later in the document and pushed the score
            further down the page.
            "Executive at a Glance" removed: it surfaced top issues
            BEFORE the score, training the customer to read failure
            before context. The full Section 02 / 03 below carry the
            same content with evidence. */}

        {/* Phase F — Section 01 marker. Numbered intelligence-brief
            structure (Cloudflare / Semrush executive-report rhythm).
            Cover → hero → Section 01 → … → Section 06 → Appendix. */}
        <SectionMarker number="01" title="Your Score" />

        {/* Overall score card */}
        <section className="mt-6">
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
          {/* Phase E — ExecutiveSummaryBlock removed. Its three groups
              (signals AI can use / missing retrieval / unverified
              dimensions) are now consolidated into WhyYouReceivedThisScore
              below, which uses the same drivers data through the
              POSITIVE_LABELS / NEGATIVE_LABELS customer-language table. */}
          {/* Report Polish P1 — Why You Received This Score now pairs
              directly with the score card. Customer-language read of
              the strongest + weakest contributors that explain the
              number above. */}
          <WhyYouReceivedThisScore score={score} />

          {/* Phase F — Category Breakdown moved up to live with the
              score, as part of the opening Your Score section. The six
              horizontal score bars are the executive-readable layer.
              The radar chart sits below as a secondary supporting
              visual so owners can also see the *shape* of their
              visibility once they've read the bars. Each bar shows
              its rubric weight (Phase C) so the customer can
              reconstruct the overall from the six cards. */}
          <section className="report-section-card report-section-impact mt-10">
            <div className="report-section-card-header">
              <p className="section-eyebrow">
                {SECTION_EYEBROWS.categoryBreakdown}
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

          <p className="report-score-consistency-note">
            The GeoViz score reflects how confidently modern AI
            systems can identify, interpret, and reference your
            business using publicly accessible website and trust
            signals. Directional — not a ranking guarantee.
          </p>
        </section>

        {/* Phase E — "How this score was built" methodology aside
            moved into the appendix at the end of the report. It's
            customer-valuable but not customer-essential, and
            interrupted the read from score → AI systems. */}

        {/* Phase F — Section 02 marker. Groups the WhatAiSystemsRead
            metric strip, FourModelGrid (per-provider verdicts),
            ConsensusSummary (cross-model agreement), and
            ConsensusActionAnchor (soft CTA) into one numbered
            section: "What AI Systems Found." */}
        <SectionMarker number="02" title="What AI Systems Found" />

        {/* Report Polish P4 — single consolidated "What AI Systems
            Read" section. Previously the report rendered both this
            quantitative strip AND a categorical FOUND/PARTIAL
            checklist (AiInputsAnalyzed); the two overlapped enough
            that the customer read it as padding. AiInputsAnalyzed
            was deleted; the metric strip is now the single answer
            to "what did the system actually analyze?" */}
        <WhatAiSystemsRead
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
        <FourModelGrid
          aiValidations={context?.aiValidations ?? null}
          businessName={businessLabel}
          auditUrl={websiteUrl}
        />

        {/* Phase E — "Why this matters" aside removed. It duplicated
            the (also removed) "Why this audit exists" premise. The
            Foundation Fix CTA below already carries the action ask
            and the consensus section's footnote carries the
            interpretive frame. */}

        {/* Report v2 — AI Consensus Summary. Plain-English
            distillation of the agreement signals — what all systems
            identified, what they understood, what they couldn't
            verify. Renders the Overall AI Recommendation Confidence
            LABEL (not score). Fail-soft hidden when fewer than 2
            providers passed. */}
        <ConsensusSummary
          aiValidations={context?.aiValidations ?? null}
          consensusIndex={context?.consensusIndex ?? null}
          businessName={businessLabel}
        />

        {/* Report Polish P6 — Foundation Fix nudge anchored to the
            peak emotional moment (right after the consensus reveals
            LOW or MODERATE confidence). Hidden on HIGH confidence
            reports. Soft anchor only — the full Section 05 CTA still
            renders at the end of the report. */}
        <ConsensusActionAnchor
          aiValidations={context?.aiValidations ?? null}
          consensusIndex={context?.consensusIndex ?? null}
          businessName={businessLabel}
        />

        {/* Phase F — Category breakdown moved up to pair with the
            score card under Section 01, immediately after
            WhyYouReceivedThisScore. */}

        {/* Launch Blocker P2 #7 — Cross-Model Intelligence block
            REMOVED. The customer already sees the same 4 systems
            with the full read on pages 7-9 via FourModelGrid (rich
            cards with Industry / Location / Services / Missing /
            Confidence / Sources / Would-Recommend / Reason). Repeating
            those same 4 systems here with truncated text weakened
            both surfaces and read as padding. The component
            definition remains in this file for legacy callers but is
            no longer rendered in the audit report. */}

        {/* Phase E — Top Strengths section removed. Its strength cards
            were a duplicate of the positive contributors already shown
            in WhyYouReceivedThisScore (with the same customer-language
            POSITIVE_LABELS). One read of strengths per report is
            enough. */}

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
            number="03"
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
            number="04"
            badge="Top 3 fixes"
            itemKind="fix"
          />
        ) : null}

        {happensSection ? (
          <SectionCard
            section={happensSection}
            tone="impact"
            number="05"
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

        {/* Phase E — Appendix consolidates the methodology disclosure
            (moved out of the body) with the optional technical-details
            section (when the worker emits one). Collapsed by default
            so the main read ends with the CTA, not an engineering
            block. */}
        <details className="report-tech-details mt-12" open={false}>
          <summary>
            <span className="section-eyebrow">Appendix</span>
            <span className="report-tech-summary-title">
              Methodology &amp; Technical Details
            </span>
            <span className="report-tech-summary-hint">
              Click to expand — how this score was built
            </span>
          </summary>
          <div className="mt-5 space-y-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                How this score was built
              </p>
              <p className="report-prose mt-3 text-[14px] leading-relaxed text-white/80">
                GeoViz analyzed publicly accessible website and trust
                signals — including site content, business identity
                details, structured business data, and AI-crawler
                accessibility. The composite reflects six categories
                covering AI readability, business identity verification,
                trust signals, content depth, brand presence, and
                technical accessibility. Each report is reviewed
                before delivery.
              </p>
            </div>
            {techSection ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Technical details (advanced)
                </p>
                <Prose className="mt-3">
                  {stripScoreMath(techSection.body)}
                </Prose>
              </div>
            ) : null}
          </div>
        </details>

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
 * Phase F — premium intelligence-brief section marker. Mono number
 * on the left, h2 title on the right, thin accent rule underneath.
 * Mirrors the Cloudflare / Semrush / Gartner executive-report
 * numbered-section pattern. Stays tight: one line, no body prose —
 * just the chapter heading that anchors the read.
 */
function SectionMarker({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="report-section-marker mt-14">
      <span className="report-section-marker-num">{number}</span>
      <h2 className="report-section-marker-title">{title}</h2>
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
  nameInconsistency,
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
  nameInconsistency?: {
    primary: string;
    alternates: string[];
  } | null;
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
  const scoreLabel = formatDisplayScore(overall);
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
        {nameInconsistency && nameInconsistency.alternates.length > 0 ? (
          <p className="report-cover-name-conflict">
            Identity inconsistency detected — also referenced as{" "}
            <span>{nameInconsistency.alternates.join(", ")}</span>.
          </p>
        ) : null}
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
