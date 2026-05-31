import { SECTION_EYEBROWS } from "@/lib/report-sections";
import type { ReportScore, ScoreCategoryKey } from "@/lib/parse-report";

/**
 * Why You Received This Score — report v2 descriptive breakdown.
 *
 * Sits between the score card and Section 02. NOT a score
 * recalculation — just a customer-language description of which
 * dimensions pulled the score up and which pulled it down. Derived
 * purely from the already-parsed `ReportScore.categories` array.
 *
 * Customer-language only. Never says "Trust Signals scored 12/20"
 * — instead says "Testimonials detected" / "Reviews missing".
 */

type Contributor = {
  key: ScoreCategoryKey;
  label: string;
  ratio: number;
};

// Positive-contributor labels: what an above-threshold category MEANS
// for an AI system trying to recommend the business.
const POSITIVE_LABELS: Record<ScoreCategoryKey, string> = {
  schema: "Business identity verified by AI",
  crawler: "AI crawlers can reach your site",
  trust: "Testimonials and trust signals detected",
  content: "Content depth enough to quote",
  brand: "Brand identity is clear and consistent",
  tech: "Site structure is AI-readable",
};

// Negative-contributor labels: what a low category MEANS as a missing
// signal. Customer-language; never names rubric weights.
const NEGATIVE_LABELS: Record<ScoreCategoryKey, string> = {
  schema: "AI cannot easily verify your business identity",
  crawler: "AI crawlers may have trouble reaching your content",
  trust: "Reviews and trust signals are limited",
  content: "Content depth is not sufficient for AI to quote",
  brand: "Brand identity is not consistent across the web",
  tech: "Site structure is hard for AI to read",
};

function topContributors(score: ReportScore): {
  positive: Contributor[];
  negative: Contributor[];
} {
  const scored = score.categories
    .filter(
      (c): c is typeof c & { score: number } =>
        typeof c.score === "number" && c.max > 0,
    )
    .map((c) => ({
      key: c.key,
      label: POSITIVE_LABELS[c.key] ?? c.short,
      ratio: c.score / c.max,
    }));
  // Highest 3 = positive. Lowest 3 = negative. A category never
  // appears in both lists because we sort independently and take
  // the top-by-direction.
  const sorted = [...scored];
  const positive = [...sorted]
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .filter((c) => c.ratio >= 0.55);
  const negative = [...sorted]
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 3)
    .filter((c) => c.ratio < 0.55)
    .map((c) => ({
      ...c,
      label: NEGATIVE_LABELS[c.key] ?? c.label,
    }));
  return { positive, negative };
}

export function WhyYouReceivedThisScore({
  score,
}: {
  score: ReportScore;
}) {
  // Render nothing when we have no parsed categories at all — the
  // section would just be two empty columns.
  const hasAnyScored = score.categories.some(
    (c) => typeof c.score === "number",
  );
  if (!hasAnyScored) return null;

  const { positive, negative } = topContributors(score);
  if (positive.length === 0 && negative.length === 0) return null;

  return (
    <section
      className="report-section-card mt-10"
      aria-label="Why you received this score"
    >
      <div className="report-section-card-header">
        <p className="section-eyebrow">
          {SECTION_EYEBROWS.whyYouReceivedThisScore}
        </p>
      </div>
      <h2 className="h2 mt-3">What pulled the score up — and what held it back.</h2>
      <p className="muted mt-2 max-w-2xl text-sm leading-relaxed">
        These are the strongest signals AI systems could use, and the
        ones they couldn&rsquo;t. This is descriptive — it explains the
        score; it isn&rsquo;t a separate calculation.
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-severity-info">
            Top Positive Contributors
          </p>
          {positive.length === 0 ? (
            <p className="muted mt-3 text-sm">
              No category reached the strong-contributor threshold.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {positive.map((c) => (
                <li
                  key={`pos-${c.key}`}
                  className="flex items-start gap-3 text-[13px] leading-relaxed text-white/80"
                >
                  <span
                    aria-hidden
                    className="mt-[2px] inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-severity-info/40 text-[11px] text-severity-info"
                  >
                    ✓
                  </span>
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-severity-critical">
            Top Negative Contributors
          </p>
          {negative.length === 0 ? (
            <p className="muted mt-3 text-sm">
              No category fell into the weak-contributor range.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {negative.map((c) => (
                <li
                  key={`neg-${c.key}`}
                  className="flex items-start gap-3 text-[13px] leading-relaxed text-white/80"
                >
                  <span
                    aria-hidden
                    className="mt-[2px] inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-severity-critical/40 text-[11px] text-severity-critical"
                  >
                    ✕
                  </span>
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
