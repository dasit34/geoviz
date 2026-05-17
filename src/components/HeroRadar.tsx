/**
 * AI Visibility Radar — the brand identity artifact in the
 * homepage hero. Pure SVG; no data prop; decorative-but-intentional.
 *
 * Design direction (per CLAUDE_DESIGN.md "Satellite visibility
 * system meets Bloomberg Terminal"):
 *   - Restrained scanning sweep (12s) — operational, not flashy.
 *   - Cyan-only chrome (rings, axes, telemetry labels). Cyan is
 *     reserved across the codebase for radar + telemetry — never
 *     for CTAs or score values.
 *   - Amber accent only on the center marker + sample polygon (the
 *     "your business" data point).
 *   - No bouncing dots, no glowing trails, no neon hum.
 *
 * Accessibility:
 *   - `aria-hidden` on the SVG — the headline + subhead carry the
 *     meaning; the radar is decorative.
 *   - Honors `prefers-reduced-motion` via the CSS sweep wrapper —
 *     reduced-motion users see the static radar without the sweep.
 *
 * Used by: `src/app/page.tsx` hero (right column of the 5fr:3fr
 * grid). Do not introduce additional consumers without confirming
 * the "radar = singular hero identity" pattern still holds.
 */

const VIEWBOX = 320;
const CENTER = VIEWBOX / 2;
const MAX_RADIUS = 132; // leaves room for telemetry labels at ~150px from center.

// Six dimensions arranged around the radar — these are the GeoViz
// audit pillars surfaced in the homepage "What we audit" section.
// Keeping them in this exact order matches the customer report and
// the visual rhythm of the section below.
const VERTICES = [
  "Schema",
  "Entity",
  "Crawlability",
  "Citations",
  "AI Readability",
  "Trust Signals",
] as const;

// Hardcoded sample values (0..1 of max radius). Decorative — not a
// real audit score. Chosen to look "plausibly mid-range" so the
// polygon reads as a real reading without implying a specific
// customer's data.
const SAMPLE_VALUES = [0.45, 0.7, 0.55, 0.45, 0.65, 0.6] as const;

const RING_RADII = [
  MAX_RADIUS * 0.25,
  MAX_RADIUS * 0.5,
  MAX_RADIUS * 0.75,
  MAX_RADIUS,
];

// Pre-compute axis endpoints + label positions + sample polygon.
// Axis angle starts at -90deg (top) and walks clockwise.
function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(rad) * radius,
    y: CENTER + Math.sin(rad) * radius,
  };
}

const axisAngles = VERTICES.map((_, i) => (i * 360) / VERTICES.length);
const axisEnds = axisAngles.map((angle) => polar(angle, MAX_RADIUS));
const labelPositions = axisAngles.map((angle) => polar(angle, MAX_RADIUS + 22));
const samplePoints = SAMPLE_VALUES.map((v, i) =>
  polar(axisAngles[i], MAX_RADIUS * v),
);
const samplePolygonPath = samplePoints
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
          {/* Scanning-sweep gradient — a 60deg wedge that fades from
              cyan-at-leading-edge to fully-transparent at the trailing
              edge. Wraps the sweep element in a rotating <g> so the
              gradient orientation stays fixed relative to the sweep
              wedge, not the SVG canvas. */}
          <linearGradient id="hero-radar-sweep" x1="50%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="rgba(103, 232, 249, 0.18)" />
            <stop offset="60%" stopColor="rgba(103, 232, 249, 0.05)" />
            <stop offset="100%" stopColor="rgba(103, 232, 249, 0)" />
          </linearGradient>
          {/* Soft inner-radial glow under the center marker so it
              reads as a "live target" without resorting to a hard drop
              shadow. */}
          <radialGradient id="hero-radar-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 154, 60, 0.35)" />
            <stop offset="100%" stopColor="rgba(255, 154, 60, 0)" />
          </radialGradient>
        </defs>

        {/* Concentric rings — cyan, low opacity. Outer ring slightly
            stronger so the radar has a defined boundary. */}
        {RING_RADII.map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx={CENTER}
            cy={CENTER}
            r={r}
            fill="none"
            stroke={i === RING_RADII.length - 1
              ? "rgba(103, 232, 249, 0.28)"
              : "rgba(103, 232, 249, 0.15)"}
            strokeWidth={1}
          />
        ))}

        {/* Six radial axes — neutral white, lower opacity than rings
            so the cyan rings dominate. */}
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

        {/* Scanning sweep — a 60deg cyan wedge that rotates over
            12 seconds. The wrapper <g> handles rotation; the inner
            path is the wedge itself. */}
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

        {/* Sample data polygon — translucent amber. The "your
            business" reading shape. Stroke faintly visible so the
            polygon has structure; fill is low so the rings + sweep
            stay visually dominant. */}
        <path
          d={samplePolygonPath}
          fill="rgba(255, 122, 24, 0.10)"
          stroke="rgba(255, 122, 24, 0.35)"
          strokeWidth={1}
          strokeLinejoin="round"
        />

        {/* Sample data vertex dots — tiny amber markers at each
            sample value point. Reinforces the polygon as a data
            shape, not just a decoration. */}
        {samplePoints.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="rgba(255, 154, 60, 0.85)"
          />
        ))}

        {/* Center marker — amber dot over a soft radial glow.
            Subtle pulse via the existing pulseSoft keyframe. The
            "you are here" pin. */}
        <circle cx={CENTER} cy={CENTER} r={18} fill="url(#hero-radar-center-glow)" />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={4}
          fill="#ff9a3c"
          className="motion-safe:animate-pulseSoft"
        />

        {/* Telemetry labels — uppercase mono, low opacity. One per
            vertex. Text alignment swings between start/middle/end
            based on the vertex's clock position so labels don't
            collide with the rings. */}
        {VERTICES.map((label, i) => {
          const pos = labelPositions[i];
          const angle = axisAngles[i];
          // top (0deg) + bottom (180deg) → middle; left half → end;
          // right half → start.
          const anchor =
            angle === 0 || angle === 180
              ? "middle"
              : angle > 180
                ? "end"
                : "start";
          return (
            <text
              key={`label-${i}`}
              x={pos.x}
              y={pos.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="hero-radar-label"
              fontSize={10}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              fill="rgba(255, 255, 255, 0.55)"
              letterSpacing="0.18em"
            >
              {label.toUpperCase()}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
