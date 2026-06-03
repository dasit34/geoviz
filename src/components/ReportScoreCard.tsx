"use client";

import {
  detectJsHeavySite,
  plainEnglishBandLabel,
  scoreToneFromOverall,
  type ReportScore,
} from "@/lib/parse-report";
import { formatDisplayScore } from "@/lib/scoring/format-score";

/**
 * Primary GeoViz score artifact. Same JSX powers the on-screen view
 * and the puppeteer-driven PDF.
 *
 * Redesigned in PR #26 (hero/score/preview redesign) to read as a
 * Bloomberg-style intelligence document rather than a card with a
 * decorated number. The visual gravity sits on a single dominant
 * mono-font number (112px). Header, caption, and provenance footer
 * frame the number as a *document data point*, not a chart element.
 *
 * Anatomy (top → bottom):
 *   1. Header row — label left, status pill right.
 *   2. Inline score reference — single sentence "Your AI Visibility
 *      Score is {N}/100 — {band}." Body-prose typography, NOT a
 *      hero-style jumbo number. The cover page is the single source
 *      of the big visual score; the body card now reads as a
 *      contextual strip carrying the operational supporting signals.
 *   3. Caption — one tone-specific sentence.
 *   4. Optional advisory footnote — JS-heavy-site note, demoted
 *      from a bordered box to a small footnote line.
 *   5. Provenance footer — Audit Date + Report ID grid. Only renders
 *      when `orderId` is provided. The mono Report ID is the
 *      identity hook unique to GeoViz reports.
 *
 * `markdown` is optional and used only to surface the JS-heavy
 * advisory line — no scoring logic depends on it.
 * `orderId` is optional and used only to render the provenance
 * footer — sample/preview render paths can omit it and the footer
 * simply doesn't render (graceful degradation).
 */
export type ReportScoreCardContext = {
  /** Customer-facing percentile copy from getAuditPercentile().copy */
  percentileCopy?: string | null;
  /** Customer-facing confidence label from formatCustomerConfidence() */
  confidenceLabel?: string | null;
  /** Single-sentence reason from formatCustomerConfidence() */
  confidenceReason?: string | null;
  /** Optional weakest-category watch line (only when materially weak) */
  weakestCategoryCopy?: string | null;
};

export function ReportScoreCard({
  score,
  markdown,
  orderId,
  reportGeneratedAt,
  context,
}: {
  score: ReportScore;
  markdown?: string | null;
  orderId?: string;
  reportGeneratedAt?: Date | null;
  context?: ReportScoreCardContext;
}) {
  const tone = scoreToneFromOverall(score.overall);
  const overallLabel = formatDisplayScore(score.overall);
  // Customer-facing status: plain-English label collapsed from the
  // 5-band rubric. Falls back to a parsed status word only when the
  // overall couldn't be extracted from the markdown.
  const status =
    typeof score.overall === "number"
      ? plainEnglishBandLabel(score.overall)
      : score.status ?? riskLabelForTone(tone);

  const isJsHeavy = detectJsHeavySite(markdown ?? null);

  // Derive a stable, human-quotable Report ID from the order cuid.
  // Pattern: GEO-{last 8 of cuid uppercased}. Customers cite this in
  // support email; operators search on it. The mono treatment in the
  // footer is the GeoViz DNA hook.
  const reportRef = orderId ? `GEO-${orderId.slice(-8).toUpperCase()}` : null;
  const auditDateLabel = reportGeneratedAt
    ? formatAuditDate(reportGeneratedAt)
    : null;

  return (
    <section className={`score-card score-card-tone-${tone}`}>
      <header className="score-card-header">
        <div className="score-card-top-label">AI Visibility Score</div>
        <div className="score-card-top-status">{status}</div>
      </header>

      <p className="score-card-inline-ref">
        Your AI Visibility Score is{" "}
        <span className="mono-data score-card-inline-ref-num">
          {overallLabel}
        </span>
        <span className="score-card-inline-ref-max">/100</span> — {status}.
      </p>

      <p className="score-card-caption">{captionForTone(tone)}</p>

      {(() => {
        const explainer = deriveScoreExplanation(score);
        return explainer ? (
          <p className="score-card-explainer">{explainer}</p>
        ) : null;
      })()}

      {context && (context.percentileCopy || context.confidenceLabel) ? (
        <div className="score-card-context-strip">
          {context.percentileCopy ? (
            <span className="score-card-context-pill">
              {context.percentileCopy}
            </span>
          ) : null}
          {context.confidenceLabel ? (
            <span className="score-card-context-pill">
              {context.confidenceLabel}
              {context.confidenceReason ? (
                <span className="score-card-context-pill-sep"> · </span>
              ) : null}
              {context.confidenceReason ? (
                <span className="score-card-context-pill-reason">
                  {context.confidenceReason}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {context?.weakestCategoryCopy ? (
        <p className="score-card-watch">
          <span className="score-card-watch-label">Watch:</span>{" "}
          {context.weakestCategoryCopy}
        </p>
      ) : null}

      {isJsHeavy ? (
        <p className="score-card-advisory">
          * Modern app-style websites can sometimes make AI readability
          more difficult, even for large brands.
        </p>
      ) : null}

      {reportRef ? (
        <footer className="score-card-meta-footer">
          {auditDateLabel ? (
            <div className="score-card-meta-cell">
              <span className="score-card-meta-label">Audit date</span>
              <span className="score-card-meta-value">{auditDateLabel}</span>
            </div>
          ) : null}
          <div className="score-card-meta-cell">
            <span className="score-card-meta-label">Report ID</span>
            <span className="score-card-meta-value mono-data">{reportRef}</span>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function riskLabelForTone(tone: "ok" | "warn" | "bad" | "muted"): string {
  switch (tone) {
    case "ok":
      return "Good";
    case "warn":
      return "Needs Work";
    case "bad":
      return "Limited Visibility";
    default:
      return "Pending";
  }
}

// Single-sentence tone-specific caption. Replaces the previous
// long-form explainer + blurb pair. Read order in the redesigned
// card: header → big number → this caption.
function captionForTone(tone: "ok" | "warn" | "bad" | "muted"): string {
  switch (tone) {
    case "ok":
      return "AI systems can cite your business with confidence when a customer asks for a local option.";
    case "warn":
      return "Key visibility signals are missing — competitors with cleaner structure may be cited first.";
    case "bad":
      return "AI systems lack sufficient verified signal to recommend your business.";
    default:
      return "Score breakdown will appear here once the audit completes.";
  }
}

function formatAuditDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * F6 — deterministic "why this score" explainer. Answers the obvious
 * customer question when a few categories are perfect but the overall
 * lands mid-range: "if Tech and AI Readability are 100, why is the
 * overall 56?" Derived entirely from `score.categories` — no model
 * generation, no fabrication risk.
 *
 * Gate: only render when there's a real gap to explain — at least one
 * category at ≥80% of its max AND at least one at <40% of its max AND
 * the overall is below 70. Otherwise the caption already says enough.
 */
export function deriveScoreExplanation(score: ReportScore): string | null {
  if (typeof score.overall !== "number" || score.overall >= 70) return null;
  const scored = score.categories
    .map((c) => ({
      short: c.short,
      ratio:
        typeof c.score === "number" && c.max > 0 ? c.score / c.max : null,
    }))
    .filter(
      (c): c is { short: string; ratio: number } => c.ratio !== null,
    )
    .sort((a, b) => b.ratio - a.ratio);
  if (scored.length < 2) return null;
  const highest = scored[0];
  const lowest = scored[scored.length - 1];
  if (!highest || !lowest) return null;
  if (highest.ratio < 0.8 || lowest.ratio >= 0.4) return null;

  const nextHighest = scored[1];
  const nextLowest = scored[scored.length - 2];
  const strongList =
    nextHighest && nextHighest.ratio >= 0.8
      ? `${highest.short} and ${nextHighest.short}`
      : highest.short;
  const weakList =
    nextLowest && nextLowest.ratio < 0.4
      ? `${lowest.short} and ${nextLowest.short}`
      : lowest.short;

  return (
    `Your website is strong on ${strongList}, so AI systems can read ` +
    `and interpret it cleanly. The overall lands at ${Math.round(score.overall)} because ` +
    `${weakList} are incomplete — those are the signals AI systems ` +
    `use to verify who you are and whether to recommend you. Strong ` +
    `readability without strong identity signals reads as ambiguous ` +
    `to recommendation engines.`
  );
}
