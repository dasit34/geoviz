/**
 * Hero report preview — a static "document peek" that sits in the
 * homepage hero's right column. Redesigned in PR #26 (hero/score/
 * preview redesign) to drop the decorative SVG progress ring + pill
 * badge + pulsing bullet dots in favor of the same mono-number /
 * provenance-footer DNA as the full ReportScoreCard, scaled down
 * (64px vs 112px).
 *
 * No interactive behavior — purely visual. Not animated.
 *
 * Note: the hero JSX no longer wraps this in `animate-floatY` (PR
 * #26 dropped the float). If the consumer wraps it in an animation
 * elsewhere, the inner card has no opinion on motion.
 */

type ScoreState = "at-risk" | "healthy" | "strong";

const STATE_LABEL: Record<ScoreState, string> = {
  "at-risk": "Limited Visibility",
  healthy: "Good",
  strong: "Strong",
};

// Tone-mapped colors. Matches the `.score-card-tone-*` palette in
// `print.css` so the preview reads as a smaller-scale version of the
// real score card — same identity, different size.
const STATE_NUM_COLOR: Record<ScoreState, string> = {
  "at-risk": "text-accent-glow",
  healthy: "text-amber-300",
  strong: "text-emerald-300",
};

const STATE_BAND_COLOR: Record<ScoreState, string> = {
  "at-risk": "text-accent-glow",
  healthy: "text-amber-300",
  strong: "text-emerald-300",
};

export function ReportPreview({
  score = 42,
  state = "at-risk",
}: {
  score?: number;
  state?: ScoreState;
}) {
  return (
    <article className="card relative w-full max-w-sm">
      {/* Document header — domain + audit date. No pill badge; the
          header IS the identifier. */}
      <header className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-white">
          yourbusiness.com
        </h3>
        <span className="mono-data text-[10px] uppercase tracking-[0.18em] text-white/40">
          MAY 2026
        </span>
      </header>

      {/* Main score block — 64px mono number, tone-colored, with
          status band directly below. Same anatomy as the full
          ReportScoreCard, scaled to a peek. */}
      <div className="mt-6">
        <div className="flex items-baseline gap-2">
          <span
            className={`mono-data text-[64px] font-bold leading-none ${STATE_NUM_COLOR[state]}`}
          >
            {score}
          </span>
          <span className="text-xl font-bold text-white/40">/ 100</span>
        </div>
        <p
          className={`mt-3 text-xs font-semibold uppercase tracking-[0.16em] ${STATE_BAND_COLOR[state]}`}
        >
          {STATE_LABEL[state]}
        </p>
      </div>

      {/* Top findings — plain text, no bullets, no animated dots.
          Reads as a document excerpt. */}
      <ul className="mt-6 space-y-2 text-[13px] leading-snug text-white/70">
        <li className="flex gap-2">
          <span className="text-white/35">→</span>
          <span>Missing structured data</span>
        </li>
        <li className="flex gap-2">
          <span className="text-white/35">→</span>
          <span>Weak service clarity</span>
        </li>
        <li className="flex gap-2">
          <span className="text-white/35">→</span>
          <span>No FAQ structure</span>
        </li>
      </ul>

      {/* Mini stats grid — three data cells with mono values. Replaces
          the larger Stat-card grid; this is dense and scannable. */}
      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
        <Stat label="Crawlers" value="2 / 5" mono />
        <Stat label="Schema" value="Partial" />
        <Stat label="Citability" value="Low" />
      </div>

      {/* Provenance footer — mono Report ID + audit date. Same DNA as
          the full ReportScoreCard footer. Makes the preview feel like
          a real artifact, not a template. */}
      <footer className="mt-5 border-t border-white/5 pt-3">
        <p className="mono-data text-[10px] uppercase tracking-[0.18em] text-white/35">
          GEO-SAMPLE-001 · sample audit
        </p>
      </footer>
    </article>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="mono-data text-[10px] uppercase tracking-[0.16em] text-white/35">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold text-white ${mono ? "mono-data" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
