"use client";

import {
  detectJsHeavySite,
  plainEnglishBandLabel,
  scoreToneFromOverall,
  type ReportScore,
} from "@/lib/parse-report";

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
 *   2. Main score block — 112px mono number + `/ 100` denominator,
 *      tone-colored via the existing `.score-card-tone-{ok|warn|bad}`
 *      classes.
 *   3. Caption — one tone-specific sentence (replaces the previous
 *      explainer + blurb paragraph pair).
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
export function ReportScoreCard({
  score,
  markdown,
  orderId,
  reportGeneratedAt,
}: {
  score: ReportScore;
  markdown?: string | null;
  orderId?: string;
  reportGeneratedAt?: Date | null;
}) {
  const tone = scoreToneFromOverall(score.overall);
  const overallLabel = typeof score.overall === "number" ? score.overall : "—";
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

      <div className="score-card-main">
        <div className="score-card-overall">
          <span className="score-card-overall-num">{overallLabel}</span>
          <span className="score-card-overall-max">/ 100</span>
        </div>
      </div>

      <p className="score-card-caption">{captionForTone(tone)}</p>

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
