"use client";

import {
  scoreToneFromOverall,
  type ReportScore,
} from "@/lib/parse-report";

/**
 * Premium score card rendered at the top of the audit report. Replaces
 * the small score badge in the header with a full-width panel that
 * shows the overall, the risk label, and a horizontal bar for each of
 * the six rubric categories. Pure server component — same JSX is used
 * for the on-screen view and the puppeteer-driven PDF.
 */
export function ReportScoreCard({ score }: { score: ReportScore }) {
  const tone = scoreToneFromOverall(score.overall);
  const overallLabel = typeof score.overall === "number" ? score.overall : "—";
  const status = score.status ?? riskLabelForTone(tone);

  return (
    <section className={`score-card score-card-tone-${tone}`}>
      <div className="score-card-top">
        <div className="score-card-top-label">AI Visibility Score</div>
        <div className="score-card-top-status">{status}</div>
      </div>
      <div className="score-card-overall-row">
        <div className="score-card-overall">
          <span className="score-card-overall-num">{overallLabel}</span>
          <span className="score-card-overall-max">/ 100</span>
        </div>
        <p className="score-card-blurb">{blurbForTone(tone)}</p>
      </div>
      <ul className="score-card-bars">
        {score.categories.map((cat) => {
          const filled = cat.score === null ? 0 : cat.score / cat.max;
          const barTone = toneForRatio(filled);
          return (
            <li key={cat.key} className="score-card-bar">
              <div className="score-card-bar-row">
                <span className="score-card-bar-label">{cat.short}</span>
                <span className="score-card-bar-value">
                  {cat.score === null ? "—" : cat.score}
                  <span className="score-card-bar-max"> / {cat.max}</span>
                </span>
              </div>
              <div className="score-card-bar-track">
                <div
                  className={`score-card-bar-fill score-card-bar-fill-${barTone}`}
                  style={{ width: `${Math.round(filled * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function riskLabelForTone(tone: "ok" | "warn" | "bad" | "muted"): string {
  switch (tone) {
    case "ok":
      return "Strong";
    case "warn":
      return "Needs Work";
    case "bad":
      return "At Risk";
    default:
      return "Pending";
  }
}

function blurbForTone(tone: "ok" | "warn" | "bad" | "muted"): string {
  switch (tone) {
    case "ok":
      return "AI tools have a clear picture of your business and you have a real chance of being recommended when local customers ask.";
    case "warn":
      return "AI tools see some of what you do, but enough is missing that customers may pick a competitor when they ask for a local pro.";
    case "bad":
      return "AI tools don't have what they need to recommend you. When customers ask, your business is being skipped.";
    default:
      return "Score breakdown will appear here once the audit completes.";
  }
}

function toneForRatio(ratio: number): "ok" | "warn" | "bad" {
  if (ratio >= 0.7) return "ok";
  if (ratio >= 0.4) return "warn";
  return "bad";
}
