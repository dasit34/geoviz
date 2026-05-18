/**
 * AI Visibility Radar — the scanning instrument that anchors the
 * homepage hero. Pure SVG; no data prop; decorative.
 *
 * Rebuilt (PR #29) against references/geoviz-radar-reference.png as
 * the PRIMARY visual direction:
 *   - WARM ORANGE is the dominant accent — rings, sweep, center
 *     glow, signal dots. This is the GeoViz signature.
 *   - Cyan usage is minimal — a single faint tick per platform
 *     marker, nothing more.
 *   - Five platform markers orbit the perimeter, each with a small
 *     scanner-status verb (Crawling / Analyzing / …). These are
 *     decorative scanner chrome — the radar is a visual identity,
 *     not a live feed. All factual claims live in real copy
 *     elsewhere on the page.
 *   - Reads as a real scanning instrument, not a chart.
 *
 * Accessibility: aria-hidden (the headline + copy carry meaning).
 * Honors prefers-reduced-motion via motion-safe: on the sweep +
 * center pulse.
 */

const VIEWBOX = 360;
const CENTER = VIEWBOX / 2;
const MAX_RADIUS = 150;

// The 5 AI systems GeoViz tests against, with a decorative scanner
// verb each. Distributed clockwise from top.
const PLATFORMS = [
  { name: "ChatGPT", status: "Crawling" },
  { name: "Claude", status: "Analyzing" },
  { name: "Perplexity", status: "Refreshing" },
  { name: "Gemini", status: "Scanning" },
  { name: "AI Overviews", status: "Indexing" },
] as const;

// Sample reading shape (0..1 of max radius), one value per platform.
// Decorative — not a real score.
const SAMPLE_VALUES = [0.58, 0.7, 0.46, 0.62, 0.52] as const;

const RING_RADII = [
  MAX_RADIUS * 0.28,
  MAX_RADIUS * 0.52,
  MAX_RADIUS * 0.76,
  MAX_RADIUS,
];

// Scattered "signal" dots — warm orange pings inside the field.
// Hand-tuned to feel natural (not gridded, not clumped).
const SIGNAL_DOTS = [
  { r: 0.34, a: 28, o: 0.55 },
  { r: 0.5, a: 70, o: 0.7 },
  { r: 0.72, a: 104, o: 0.4 },
  { r: 0.2, a: 150, o: 0.75 },
  { r: 0.58, a: 176, o: 0.5 },
  { r: 0.8, a: 208, o: 0.38 },
  { r: 0.42, a: 240, o: 0.62 },
  { r: 0.64, a: 272, o: 0.46 },
  { r: 0.3, a: 304, o: 0.6 },
  { r: 0.76, a: 338, o: 0.42 },
];

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(rad) * radius,
    y: CENTER + Math.sin(rad) * radius,
  };
}

const axisAngles = PLATFORMS.map((_, i) => (i * 360) / PLATFORMS.length);
const samplePoints = SAMPLE_VALUES.map((v, i) =>
  polar(axisAngles[i], MAX_RADIUS * v),
);
const samplePath =
  samplePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ") + " Z";

export function HeroRadar({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="hero-radar-svg w-full max-w-[440px] mx-auto"
        aria-hidden
        focusable="false"
      >
        <defs>
          {/* Sweep wedge — warm orange fading to transparent. */}
          <linearGradient id="radar-sweep" x1="50%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="rgba(255, 122, 24, 0.30)" />
            <stop offset="55%" stopColor="rgba(255, 122, 24, 0.08)" />
            <stop offset="100%" stopColor="rgba(255, 122, 24, 0)" />
          </linearGradient>
          {/* Center glow — strong warm core. */}
          <radialGradient id="radar-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 154, 60, 0.55)" />
            <stop offset="45%" stopColor="rgba(255, 122, 24, 0.22)" />
            <stop offset="100%" stopColor="rgba(255, 122, 24, 0)" />
          </radialGradient>
        </defs>

        {/* Soft ambient core glow behind everything. */}
        <circle cx={CENTER} cy={CENTER} r={MAX_RADIUS * 0.9} fill="url(#radar-core)" />

        {/* Concentric rings — warm orange, graduated. Outer ring
            strongest so the instrument has a defined edge. */}
        {RING_RADII.map((r, i) => {
          const last = i === RING_RADII.length - 1;
          return (
            <circle
              key={`ring-${i}`}
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill="none"
              stroke={
                last
                  ? "rgba(255, 122, 24, 0.40)"
                  : `rgba(255, 122, 24, ${0.1 + i * 0.05})`
              }
              strokeWidth={last ? 1.25 : 1}
            />
          );
        })}

        {/* Faint radial axes to each platform marker. */}
        {axisAngles.map((angle, i) => {
          const end = polar(angle, MAX_RADIUS);
          return (
            <line
              key={`axis-${i}`}
              x1={CENTER}
              y1={CENTER}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth={1}
            />
          );
        })}

        {/* Scanning sweep — the signature motion. 12s, restrained. */}
        <g
          className="motion-safe:animate-radarSweep"
          style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
        >
          <path
            d={`M ${CENTER} ${CENTER}
                L ${CENTER + MAX_RADIUS} ${CENTER}
                A ${MAX_RADIUS} ${MAX_RADIUS} 0 0 0
                  ${polar(-58, MAX_RADIUS).x.toFixed(2)}
                  ${polar(-58, MAX_RADIUS).y.toFixed(2)}
                Z`}
            fill="url(#radar-sweep)"
          />
        </g>

        {/* Scattered signal dots — ambient field noise behind the
            reading shape. */}
        {SIGNAL_DOTS.map((d, i) => {
          const p = polar(d.a, MAX_RADIUS * d.r);
          return (
            <circle
              key={`sig-${i}`}
              cx={p.x}
              cy={p.y}
              r={1.6}
              fill={`rgba(255, 154, 60, ${d.o})`}
            />
          );
        })}

        {/* Reading shape — translucent warm polygon across the 5
            platform vertices. */}
        <path
          d={samplePath}
          fill="rgba(255, 122, 24, 0.13)"
          stroke="rgba(255, 122, 24, 0.45)"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
        {samplePoints.map((p, i) => (
          <circle
            key={`vtx-${i}`}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="#ff9a3c"
            stroke="rgba(5, 7, 13, 0.65)"
            strokeWidth={1.5}
          />
        ))}

        {/* Center marker — bright warm core + pulse. */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={5}
          fill="#ffb15a"
          className="motion-safe:animate-pulseSoft"
        />

        {/* Platform markers around the perimeter — name + scanner
            verb + a single faint cyan tick (the only cyan in the
            instrument). */}
        {PLATFORMS.map((p, i) => {
          const angle = axisAngles[i];
          const anchorPos = polar(angle, MAX_RADIUS + 14);
          const isMid = angle === 0 || Math.abs(angle - 180) < 1;
          const anchor = isMid ? "middle" : angle > 180 ? "end" : "start";
          const nudge = anchor === "middle" ? 0 : anchor === "end" ? -6 : 6;
          return (
            <g key={`pm-${i}`}>
              {/* perimeter tick — the lone cyan accent */}
              <circle
                cx={polar(angle, MAX_RADIUS).x}
                cy={polar(angle, MAX_RADIUS).y}
                r={2.5}
                fill="#67e8f9"
                opacity={0.7}
              />
              <text
                x={anchorPos.x + nudge}
                y={anchorPos.y - 5}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={600}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fill="rgba(255, 255, 255, 0.82)"
              >
                {p.name}
              </text>
              <text
                x={anchorPos.x + nudge}
                y={anchorPos.y + 9}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={9}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="rgba(255, 154, 60, 0.7)"
                letterSpacing="0.12em"
              >
                {p.status.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
