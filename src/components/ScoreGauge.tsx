/**
 * ScoreGauge — GeoViz's signature visualization.
 *
 * Hand-authored 270° SVG arc. The arc reads as a measurement
 * instrument: tick marks at 25/50/75, gradient stroke
 * (critical → warning → info), score number centered in
 * Instrument Serif, qualitative status mono label below, small
 * `SAMPLE` ribbon at top-right.
 *
 * Two sizes: `lg` (hero, ~360px) and `sm` (SnapshotCard, ~160px).
 * Pure server component, no client JS. Cursor pulse animation is
 * a CSS keyframe that already exists (.hero-path-pulse, 12s).
 * `prefers-reduced-motion` users see a static cursor.
 *
 * Gate-56 compliant: SAMPLE ribbon labels the value as
 * illustrative; outer card context already labels it Sample.
 */

type ScoreGaugeProps = {
  score: number;
  status: string;
  size?: "lg" | "sm";
  /** Show the "SAMPLE" ribbon. Default true (existing behavior). Set
   * false for surfaces showing a real, freshly-computed score (e.g.
   * the /check free tool) rather than a fixture/marketing sample. */
  sampleLabel?: boolean;
};

// Arc geometry: 270° sweep starting at 7-o'clock (135° from 12),
// ending at 5-o'clock (135° clockwise past 6).
// Center (50, 50) in viewBox 100x100, radius 38.
const CENTER = 50;
const RADIUS = 38;
const ARC_START_DEG = 135; // degrees, measured from positive x-axis going counterclockwise
const ARC_SWEEP_DEG = 270;

function polar(angleDeg: number, r = RADIUS) {
  // SVG y-down; convert to standard polar then negate y.
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER - r * Math.sin(rad),
  };
}

// Map a 0–100 score to angle along the 270° arc.
// score=0 → ARC_START_DEG (-225°), score=100 → ARC_START_DEG - ARC_SWEEP_DEG.
function scoreToAngle(score: number) {
  const clamped = Math.max(0, Math.min(100, score));
  return ARC_START_DEG - (clamped / 100) * ARC_SWEEP_DEG;
}

const arcStart = polar(ARC_START_DEG);
const arcEnd = polar(ARC_START_DEG - ARC_SWEEP_DEG);
// large-arc-flag = 1 because we cover > 180°.
// sweep-flag = 0 because we sweep clockwise in user-space.
const ARC_D = `M ${arcStart.x} ${arcStart.y} A ${RADIUS} ${RADIUS} 0 1 0 ${arcEnd.x} ${arcEnd.y}`;

// Background (unfilled) arc — same geometry, low opacity.
const BG_ARC_D = ARC_D;

export function ScoreGauge({
  score,
  status,
  size = "lg",
  sampleLabel = true,
}: ScoreGaugeProps) {
  const dim = size === "lg" ? 360 : 160;
  const scoreFont = size === "lg" ? 64 : 36;
  const statusFont = size === "lg" ? 9 : 7.5;
  const ribbonFont = size === "lg" ? 7.5 : 6.5;
  const tickFont = size === "lg" ? 6.5 : 5.5;

  // Stroke widths (in viewBox units)
  const arcStroke = size === "lg" ? 3 : 3.5;

  const cursorAngle = scoreToAngle(score);
  const cursorPos = polar(cursorAngle);

  // Tick anchors at 0, 25, 50, 75, 100
  const ticks = [0, 25, 50, 75, 100].map((t) => {
    const a = scoreToAngle(t);
    const inner = polar(a, RADIUS - 5);
    const outer = polar(a, RADIUS + 2);
    const label = polar(a, RADIUS - 11);
    return { t, inner, outer, label };
  });

  return (
    <div
      style={{
        position: "relative",
        width: dim,
        height: dim,
        maxWidth: "100%",
      }}
      aria-label={`AI Visibility Score — ${score} of 100 · ${status}${sampleLabel ? " · Sample" : ""}`}
      role="img"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
        aria-hidden
      >
        <defs>
          <linearGradient id="scoreArc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="oklch(0.65 0.16 25)"  stopOpacity="0.85" />
            <stop offset="50%"  stopColor="oklch(0.78 0.14 70)"  stopOpacity="0.95" />
            <stop offset="100%" stopColor="oklch(0.82 0.10 220)" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id="scoreBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="oklch(0.14 0.020 250)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="oklch(0.07 0.012 248)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft radial backdrop inside the gauge */}
        <circle cx={CENTER} cy={CENTER} r={RADIUS + 4} fill="url(#scoreBg)" />

        {/* Background (track) arc */}
        <path
          d={BG_ARC_D}
          stroke="oklch(0.22 0.014 250 / 0.55)"
          strokeWidth={arcStroke}
          strokeLinecap="round"
          fill="none"
        />

        {/* Filled (gradient) arc */}
        <path
          d={ARC_D}
          stroke="url(#scoreArc)"
          strokeWidth={arcStroke}
          strokeLinecap="round"
          fill="none"
          opacity="0.88"
        />

        {/* Tick marks + labels */}
        <g>
          {ticks.map((tk) => (
            <g key={tk.t}>
              <line
                x1={tk.inner.x}
                y1={tk.inner.y}
                x2={tk.outer.x}
                y2={tk.outer.y}
                stroke="oklch(0.55 0.018 245 / 0.55)"
                strokeWidth="0.4"
              />
              <text
                x={tk.label.x}
                y={tk.label.y + 1.2}
                fill="oklch(0.55 0.018 245 / 0.85)"
                fontFamily="ui-monospace, monospace"
                fontSize={tickFont}
                textAnchor="middle"
                letterSpacing="0.08em"
              >
                {tk.t}
              </text>
            </g>
          ))}
        </g>

        {/* Cursor — small dot at the score's angle, with a hairline
            radial tick from arc out to RADIUS+5 to clearly indicate
            the value position. */}
        <line
          x1={polar(cursorAngle, RADIUS - 5).x}
          y1={polar(cursorAngle, RADIUS - 5).y}
          x2={polar(cursorAngle, RADIUS + 5).x}
          y2={polar(cursorAngle, RADIUS + 5).y}
          stroke="oklch(0.88 0.14 65 / 0.95)"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        <circle
          cx={cursorPos.x}
          cy={cursorPos.y}
          r="1.6"
          fill="oklch(0.92 0.005 250)"
          stroke="oklch(0.82 0.12 70)"
          strokeWidth="0.4"
        />

        {/* Score number — centered in the arc */}
        <text
          x={CENTER}
          y={CENTER + scoreFont * 0.18}
          fontFamily="var(--font-instrument), serif"
          fontSize={scoreFont * 0.42}
          fill="oklch(0.96 0.005 250)"
          textAnchor="middle"
          letterSpacing="-0.02em"
        >
          {score}
        </text>

        {/* "/ 100" qualifier in mono */}
        <text
          x={CENTER}
          y={CENTER + scoreFont * 0.42}
          fontFamily="ui-monospace, monospace"
          fontSize={statusFont * 0.85}
          fill="oklch(0.55 0.012 250)"
          textAnchor="middle"
          letterSpacing="0.18em"
        >
          / 100
        </text>

        {/* Status label below the score */}
        <text
          x={CENTER}
          y={size === "lg" ? 82 : 82}
          fontFamily="ui-monospace, monospace"
          fontSize={statusFont}
          fill="oklch(0.78 0.010 250)"
          textAnchor="middle"
          letterSpacing="0.20em"
        >
          {status}
        </text>

        {/* SAMPLE ribbon — top-right of the gauge frame. Omitted when
            sampleLabel=false (real, non-fixture scores). */}
        {sampleLabel ? (
          <g transform="translate(70, 8)">
            <rect
              x="-9"
              y="-3.6"
              width="18"
              height="7.2"
              rx="0.6"
              fill="oklch(0.16 0.020 248 / 0.85)"
              stroke="oklch(0.82 0.12 70 / 0.55)"
              strokeWidth="0.25"
            />
            <text
              x="0"
              y="0.8"
              fontFamily="ui-monospace, monospace"
              fontSize={ribbonFont}
              fill="oklch(0.82 0.12 70 / 0.95)"
              textAnchor="middle"
              letterSpacing="0.22em"
            >
              SAMPLE
            </text>
          </g>
        ) : null}

        {/* Frame corners — measurement-instrument ticks */}
        <g stroke="oklch(0.50 0.018 245 / 0.35)" strokeWidth="0.22" fill="none" strokeLinecap="round">
          <path d="M 4 4 L 4 9 M 4 4 L 9 4" />
          <path d="M 96 4 L 96 9 M 96 4 L 91 4" />
          <path d="M 4 96 L 4 91 M 4 96 L 9 96" />
          <path d="M 96 96 L 96 91 M 96 96 L 91 96" />
        </g>
      </svg>
    </div>
  );
}
