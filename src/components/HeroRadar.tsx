/**
 * AI Visibility Radar — the brand identity artifact in the
 * homepage hero. Pure SVG; no data prop; decorative-but-intentional.
 *
 * PR #28 update: shifts from generic dimension labels to platform
 * names (ChatGPT, Claude, Perplexity, Gemini, AI Overviews) — these
 * are THE 5 AI systems GeoViz audits against, so putting them on
 * the radar perimeter makes the visual self-explanatory. Adds
 * scattered amber data dots inside the field (decorative "signals
 * detected" pattern), brighter center glow, slightly thicker
 * outermost ring boundary.
 *
 * Design direction (per CLAUDE_DESIGN.md "Satellite visibility
 * system meets Bloomberg Terminal" + the reference image at
 * references/geoviz-radar-reference.png):
 *   - Restrained scanning sweep (12s) — operational, not flashy.
 *   - Cyan-only chrome (rings, axes, telemetry labels). Cyan is
 *     reserved across the codebase for radar + telemetry — never
 *     for CTAs or score values.
 *   - Amber accent only on the center marker, sample polygon, and
 *     scattered data dots (the "your business" data points).
 *   - No bouncing dots, no glowing trails, no neon hum.
 *
 * Accessibility:
 *   - `aria-hidden` on the SVG — the headline + subhead carry the
 *     meaning; the radar is decorative.
 *   - Honors `prefers-reduced-motion` via the `motion-safe:` prefix
 *     on the sweep + pulse classes — reduced-motion users see the
 *     static radar without the sweep or center pulse.
 */

const VIEWBOX = 320;
const CENTER = VIEWBOX / 2;
const MAX_RADIUS = 130; // leaves room for platform labels at ~150px.

// The 5 AI systems GeoViz audits against. Ordered to distribute
// evenly around the radar perimeter starting at top, clockwise.
const PLATFORMS = [
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Gemini",
  "AI Overviews",
] as const;

// Sample data values (0..1 of max radius). Decorative — not real
// scores. Chosen to look "plausibly mid-range" so the polygon reads
// as a real reading shape without implying a specific customer's
// data. One value per platform (5 vertices).
const SAMPLE_VALUES = [0.55, 0.68, 0.45, 0.6, 0.5] as const;

const RING_RADII = [
  MAX_RADIUS * 0.25,
  MAX_RADIUS * 0.5,
  MAX_RADIUS * 0.75,
  MAX_RADIUS,
];

// Scattered "signals detected" data dots — decorative amber pings
// inside the radar field. Positions hand-tuned to feel natural
// (not on a grid, not clumped). Each is {radius_pct, angle_deg}.
// Placed to fill the field without colliding with the sample polygon.
const DATA_DOTS = [
  { r: 0.32, a: 22, opacity: 0.55 },
  { r: 0.48, a: 76, opacity: 0.65 },
  { r: 0.7, a: 110, opacity: 0.4 },
  { r: 0.18, a: 145, opacity: 0.7 },
  { r: 0.55, a: 168, opacity: 0.5 },
  { r: 0.82, a: 200, opacity: 0.35 },
  { r: 0.4, a: 232, opacity: 0.6 },
  { r: 0.62, a: 268, opacity: 0.45 },
  { r: 0.28, a: 295, opacity: 0.6 },
  { r: 0.75, a: 332, opacity: 0.4 },
];

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(rad) * radius,
    y: CENTER + Math.sin(rad) * radius,
  };
}

const axisAngles = PLATFORMS.map((_, i) => (i * 360) / PLATFORMS.length);
const axisEnds = axisAngles.map((angle) => polar(angle, MAX_RADIUS));
const labelPositions = axisAngles.map((angle) => polar(angle, MAX_RADIUS + 22));
const samplePoints = SAMPLE_VALUES.map((v, i) =>
  polar(axisAngles[i], MAX_RADIUS * v),
);
const samplePolygonPath =
  samplePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ") + " Z";

export function HeroRadar({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="hero-radar-svg w-full max-w-[320px] mx-auto"
        aria-hidden
        focusable="false"
      >
        <defs>
          <linearGradient id="hero-radar-sweep" x1="50%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="rgba(103, 232, 249, 0.18)" />
            <stop offset="60%" stopColor="rgba(103, 232, 249, 0.05)" />
            <stop offset="100%" stopColor="rgba(103, 232, 249, 0)" />
          </linearGradient>
          <radialGradient id="hero-radar-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 154, 60, 0.45)" />
            <stop offset="100%" stopColor="rgba(255, 154, 60, 0)" />
          </radialGradient>
        </defs>

        {/* Concentric rings — cyan. Outer ring slightly stronger so
            the radar has a defined boundary. */}
        {RING_RADII.map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx={CENTER}
            cy={CENTER}
            r={r}
            fill="none"
            stroke={i === RING_RADII.length - 1
              ? "rgba(103, 232, 249, 0.35)"
              : "rgba(103, 232, 249, 0.15)"}
            strokeWidth={1}
          />
        ))}

        {/* Five radial axes — neutral white, lower opacity than
            rings so the cyan rings dominate. */}
        {axisEnds.map((end, i) => (
          <line
            key={`axis-${i}`}
            x1={CENTER}
            y1={CENTER}
            x2={end.x}
            y2={end.y}
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth={1}
          />
        ))}

        {/* Scanning sweep wedge — rotates over 12 seconds. */}
        <g
          className="hero-radar-sweep-wrap motion-safe:animate-radarSweep"
          style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
        >
          <path
            d={`M ${CENTER} ${CENTER}
                L ${CENTER + MAX_RADIUS} ${CENTER}
                A ${MAX_RADIUS} ${MAX_RADIUS} 0 0 0
                  ${polar(-60, MAX_RADIUS).x.toFixed(2)}
                  ${polar(-60, MAX_RADIUS).y.toFixed(2)}
                Z`}
            fill="url(#hero-radar-sweep)"
          />
        </g>

        {/* Scattered amber data dots — decorative "signals detected"
            pattern. Rendered BEHIND the sample polygon so they read
            as ambient field noise, not foreground data. */}
        {DATA_DOTS.map((d, i) => {
          const p = polar(d.a, MAX_RADIUS * d.r);
          return (
            <circle
              key={`data-${i}`}
              cx={p.x}
              cy={p.y}
              r={1.5}
              fill={`rgba(255, 154, 60, ${d.opacity})`}
            />
          );
        })}

        {/* Sample data polygon — translucent amber connecting the
            5 platform vertices. */}
        <path
          d={samplePolygonPath}
          fill="rgba(255, 122, 24, 0.12)"
          stroke="rgba(255, 122, 24, 0.4)"
          strokeWidth={1}
          strokeLinejoin="round"
        />

        {/* Sample data vertex dots — small amber markers at each
            sample value point. Bigger than data dots (3.5px vs 1.5px)
            so the polygon's data shape reads stronger. */}
        {samplePoints.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="rgba(255, 154, 60, 0.95)"
            stroke="rgba(5, 7, 13, 0.6)"
            strokeWidth={1.5}
          />
        ))}

        {/* Center marker — amber dot over a soft radial glow.
            Subtle pulse via the existing pulseSoft keyframe. */}
        <circle cx={CENTER} cy={CENTER} r={28} fill="url(#hero-radar-center-glow)" />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={4.5}
          fill="#ff9a3c"
          className="motion-safe:animate-pulseSoft"
        />

        {/* Platform labels — uppercase mono, low opacity. One per
            platform with a small cyan status dot prefix. The dot is
            drawn separately as a <circle> + the label is the <text>;
            anchor swings based on the vertex's clock position. */}
        {PLATFORMS.map((label, i) => {
          const pos = labelPositions[i];
          const angle = axisAngles[i];
          const anchor =
            angle === 0 || Math.abs(angle - 180) < 1
              ? "middle"
              : angle > 180
                ? "end"
                : "start";
          // Small cyan dot positioned just inside the label.
          const dotOffsetX =
            anchor === "middle" ? 0 : anchor === "end" ? 8 : -8;
          return (
            <g key={`label-${i}`}>
              <circle
                cx={pos.x + dotOffsetX}
                cy={pos.y}
                r={2}
                fill="#67e8f9"
              />
              <text
                x={pos.x + (anchor === "middle" ? 0 : anchor === "end" ? -2 : 2)}
                y={pos.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="hero-radar-label"
                fontSize={9.5}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                fill="rgba(255, 255, 255, 0.6)"
                letterSpacing="0.16em"
              >
                {label.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
