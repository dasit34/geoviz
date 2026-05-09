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
 */
export function CategoryScoreCard({ category }: { category: ScoreCategory }) {
  const ratio = category.score === null ? 0 : category.score / category.max;
  const tone =
    category.score === null ? "muted" : categoryToneFromRatio(ratio);
  const widthPct = Math.round(ratio * 100);
  const normalizedScore =
    category.score === null ? null : Math.round(ratio * 100);
  return (
    <div className={`category-score-card category-score-tone-${tone}`}>
      <div className="category-score-head">
        <span className="category-score-label">{category.short}</span>
        <span className="category-score-num">
          {normalizedScore === null ? "—" : normalizedScore}
          <span className="category-score-max"> / 100</span>
        </span>
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
