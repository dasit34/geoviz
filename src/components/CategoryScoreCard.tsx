import {
  categoryToneFromRatio,
  type ScoreCategory,
} from "@/lib/parse-report";

/**
 * Premium card for one rubric category. Same template every render —
 * label, normalized 0–100 score, color-toned horizontal progress bar,
 * plain-English explainer. Pure presentation; never invents data.
 *
 * Display normalization: every category is shown as a 0–100 number
 * even though the underlying rubric uses different per-category max
 * values (Schema 25, Crawler 20, etc.). This is a display choice
 * only — the actual rubric data is unchanged. Customers can compare
 * categories on the same scale at a glance instead of doing the
 * mental "14 out of 20 vs 7 out of 10" math.
 *
 * Tone (ok/warn/bad/muted) is derived from the score-to-max ratio so
 * green/yellow/orange mapping is consistent across every report.
 *
 * Customer-facing safety: when `category.score` is null AFTER both
 * the tolerant parser fallback AND the 5-of-6 derived-from-overall
 * fill in `parseReportScoreBreakdown`, we render a small "Pending"
 * tag instead of the legacy "— / 100" placeholder. The legacy
 * placeholder reduced trust on freshly-generated PDFs and was
 * flagged as a launch blocker in the pre-launch report polish review.
 */
export function CategoryScoreCard({ category }: { category: ScoreCategory }) {
  const ratio = category.score === null ? 0 : category.score / category.max;
  const tone =
    category.score === null ? "muted" : categoryToneFromRatio(ratio);
  const widthPct = Math.round(ratio * 100);
  const normalizedScore =
    category.score === null ? null : Math.round(ratio * 100);
  const hasScore = normalizedScore !== null;
  // Phase C — surface the rubric weight as a small badge so customers
  // can reconstruct the overall from the six cards. The frozen v1
  // rubric sums to 100, so `category.max` IS the weight in percent
  // (Schema 25, Crawler 20, Trust 20, Content 15, Brand 10, Tech 10).
  const weightLabel = `${Math.round(category.max)}% of score`;
  return (
    <div className={`category-score-card category-score-tone-${tone}`}>
      <div className="category-score-head">
        <span className="category-score-label">
          {category.short}
          <span className="category-score-weight" aria-label={weightLabel}>
            {Math.round(category.max)}%
          </span>
        </span>
        {hasScore ? (
          <span className="category-score-num">
            {normalizedScore}
            <span className="category-score-max"> / 100</span>
          </span>
        ) : (
          // No score AFTER strict + tolerant parse + 5-of-6 derived
          // fill. Render a calm "Pending" tag instead of the broken
          // "— / 100" placeholder. Operator can grep
          // `[geo-score-consistency]` logs to investigate — the
          // parser's diagnostic warns whenever it derives or fails
          // to parse a sub-score.
          <span className="category-score-num category-score-num-pending">
            Pending
          </span>
        )}
      </div>
      <div className="category-score-bar-track">
        <div
          className={`category-score-bar-fill category-score-bar-fill-${tone}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      {category.tooltip ? (
        <p className="category-score-explainer">{category.tooltip}</p>
      ) : null}
    </div>
  );
}
