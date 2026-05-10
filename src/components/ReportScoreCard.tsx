"use client";

import {
  detectJsHeavySite,
  plainEnglishBandLabel,
  scoreToneFromOverall,
  type ReportScore,
} from "@/lib/parse-report";

/**
 * Premium score card rendered at the top of the audit report. Replaces
 * the small score badge in the header with a full-width panel that
 * shows the overall, the risk label, and a horizontal bar for each of
 * the six rubric categories. Pure server component — same JSX is used
 * for the on-screen view and the puppeteer-driven PDF.
 *
 * `markdown` is optional and used only to surface the subtle JS-heavy
 * advisory line — no scoring logic depends on it.
 */
export function ReportScoreCard({
  score,
  markdown,
}: {
  score: ReportScore;
  markdown?: string | null;
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

  return (
    <section className={`score-card score-card-tone-${tone}`}>
      <div className="score-card-top">
        <div className="score-card-top-label">AI Visibility Score</div>
        <div className="score-card-top-status">{status}</div>
      </div>
      <p className="score-card-explainer">
        GeoViz measures how clearly ChatGPT, Claude, Gemini, and other
        AI search platforms can read, understand, and recommend your
        business online.
      </p>
      <div className="score-card-overall-row">
        <div className="score-card-overall">
          <span className="score-card-overall-num">{overallLabel}</span>
          <span className="score-card-overall-max">/ 100</span>
        </div>
        <p className="score-card-blurb">{blurbForTone(tone)}</p>
      </div>
      {isJsHeavy ? (
        <p className="score-card-advisory">
          Modern app-style websites can sometimes make AI readability more
          difficult, even for large brands.
        </p>
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

function blurbForTone(tone: "ok" | "warn" | "bad" | "muted"): string {
  switch (tone) {
    case "ok":
      return "AI search platforms have enough verified signals to confidently surface this business when customers ask for a local recommendation.";
    case "warn":
      return "AI search platforms can read parts of this business clearly, but key signals are missing — competitors with cleaner data are more likely to be cited.";
    case "bad":
      return "AI search platforms lack enough verified signals to confidently surface this business.";
    default:
      return "Score breakdown will appear here once the audit completes.";
  }
}

