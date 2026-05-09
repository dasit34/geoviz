import {
  categoryToneFromRatio,
  type ScoreCategory,
} from "@/lib/parse-report";

/**
 * Premium card for one rubric category. Same template every render —
 * label, score-of-max, color-toned bar, plain-English explainer.
 * Pure presentation; never invents data. Tone (ok/warn/bad/muted)
 * is derived from the score-to-max ratio so green/yellow/orange
 * mapping is consistent across every report.
 */
export function CategoryScoreCard({ category }: { category: ScoreCategory }) {
  const ratio = category.score === null ? 0 : category.score / category.max;
  const tone =
    category.score === null ? "muted" : categoryToneFromRatio(ratio);
  const widthPct = Math.round(ratio * 100);
  return (
    <div className={`category-score-card category-score-tone-${tone}`}>
      <div className="category-score-head">
        <span className="category-score-label">{category.short}</span>
        <span className="category-score-num">
          {category.score === null ? "—" : category.score}
          <span className="category-score-max"> / {category.max}</span>
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
