/**
 * VisibilitySignalField — the homepage hero artifact.
 *
 * Replaces the old HeroRadar. Deliberately NOT radial: a left→right
 * signal-resolution composition. One entity (your business) on the
 * left emits signals across a sparse orthogonal lattice toward five
 * AI-system endpoints on the right. Strong connectors resolve; weak
 * ones fade out — visually carrying the Conversion Rule ("I might be
 * invisible when customers ask AI who to hire") without copy.
 *
 * Constraints honored:
 *  - token colors only (accent = the lone focal entity; white/opacity
 *    = lattice + chrome; cyan = telemetry confidence ticks only).
 *  - all values are SAMPLE_ consts and the artifact renders a visible
 *    "Sample · directional" label (no unlabeled fake data).
 *  - aria-hidden (meaning lives in the hero headline/copy).
 *  - continuous flow via the `hero-path-pulse` utility (12s staggered
 *    fade across the five signal lines) + sanctioned `pulseSoft` on
 *    the central emit dot and the three strongest endpoint dots; all
 *    motion-safe-gated. Reduced-motion users get a static 0.20-opacity
 *    state per the `prefers-reduced-motion` rule in globals.css.
 */

type Endpoint = {
  label: string;
  /** sample directional retrieval confidence, 0–1 */
  confidence: number;
  y: number;
};

const SAMPLE_ENDPOINTS: Endpoint[] = [
  { label: "ChatGPT", confidence: 0.86, y: 64 },
  { label: "Claude", confidence: 0.78, y: 132 },
  { label: "Perplexity", confidence: 0.52, y: 200 },
  { label: "Gemini", confidence: 0.24, y: 268 },
  { label: "AI Overviews", confidence: 0.16, y: 336 },
];

// entity emission anchor + endpoint geometry
const EMIT_X = 170;
const EMIT_Y = 200;
const TRACK_X = 398;
const TRACK_W = 86;

function opacityClass(confidence: number): string {
  if (confidence >= 0.7) return "text-white/35";
  if (confidence >= 0.45) return "text-white/20";
  return "text-white/[0.08]";
}

export function VisibilitySignalField({
  className = "",
}: {
  className?: string;
}) {
  return (
    <figure
      className={`relative w-full overflow-hidden rounded-lg border border-white/10 bg-ink-900/50 shadow-card ${className}`}
    >
      <figcaption className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <span className="section-eyebrow">Visibility signal field</span>
        <span className="mono-data text-[11px] uppercase tracking-[0.16em] text-white/35">
          Sample · directional
        </span>
      </figcaption>

      <svg
        viewBox="0 0 520 400"
        aria-hidden
        focusable="false"
        className="block h-auto w-full"
        fill="none"
      >
        {/* ── entity (left) — the lone accent focal ─────────────── */}
        <g className="text-accent">
          <rect
            x="40"
            y="162"
            width="130"
            height="76"
            rx="8"
            className="fill-accent/[0.06] stroke-current"
            strokeWidth="1.25"
          />
          <text
            x="58"
            y="190"
            fill="currentColor"
            fontSize="13"
            fontWeight="600"
            className="text-white"
          >
            Your business
          </text>
          <g className="text-white/25" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M58 206h78" />
            <path d="M58 216h52" />
          </g>
          <circle
            cx={EMIT_X}
            cy={EMIT_Y}
            r="4"
            className="fill-accent motion-safe:animate-pulseSoft"
          />
        </g>

        {/* ── signal lattice (entity → endpoints) ───────────────── */}
        <g
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          pathLength={1}
          strokeDasharray="1"
        >
          {SAMPLE_ENDPOINTS.map((e, i) => (
            <path
              key={e.label}
              d={`M${EMIT_X} ${EMIT_Y} Q 300 ${EMIT_Y} ${TRACK_X - 14} ${e.y}`}
              stroke="currentColor"
              className={`${opacityClass(e.confidence)} hero-path-pulse`}
              style={{ animationDelay: `${i * 2.4}s` }}
            />
          ))}
        </g>

        {/* ── endpoints (right) + telemetry confidence ──────────── */}
        {SAMPLE_ENDPOINTS.map((e, i) => {
          const fillW = Math.max(4, Math.round(TRACK_W * e.confidence));
          const isStrong = e.confidence >= 0.45;
          return (
            <g key={e.label}>
              <circle
                cx={TRACK_X - 10}
                cy={e.y}
                r="2.5"
                className={
                  isStrong
                    ? "fill-cyan motion-safe:animate-pulseSoft"
                    : "fill-white/15"
                }
                style={
                  isStrong ? { animationDelay: `${i * 0.7}s` } : undefined
                }
              />
              <text
                x={TRACK_X}
                y={e.y - 7}
                fill="currentColor"
                fontSize="12"
                fontWeight="500"
                className="text-white/65"
              >
                {e.label}
              </text>
              <rect
                x={TRACK_X}
                y={e.y + 2}
                width={TRACK_W}
                height="3"
                rx="1.5"
                className="fill-white/[0.07]"
              />
              <rect
                x={TRACK_X}
                y={e.y + 2}
                width={fillW}
                height="3"
                rx="1.5"
                className={e.confidence >= 0.45 ? "fill-cyan" : "fill-white/20"}
              />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
