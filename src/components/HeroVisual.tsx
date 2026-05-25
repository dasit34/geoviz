/**
 * HeroVisual — premium AI Visibility Terrain for the hero right column.
 *
 * Hand-authored SVG, pure server component, no client JS.
 *
 *  - 6 hairline topographic contour lines (the "terrain")
 *  - 4 clean signal paths connecting selected anchor points
 *  - Tiny static endpoint dots at each path terminus
 *  - One path glows briefly every ~12s in rotation (route
 *    illumination via CSS keyframe + staggered delay per path).
 *  - No sweeping scan light, no continuous packets, no random
 *    particles. Quiet by default.
 *
 * Reduced-motion users see the composition fully static (the
 * keyframe is gated by @media in globals.css).
 *
 * Aria-hidden + decorative.
 */

type Path = {
  id: string;
  d: string;
  // 0–3: staggers the pathPulse animation so paths illuminate
  // one at a time (4 paths × 3s offset × 12s cycle).
  pulseSlot: number;
};

// Six contour lines forming an asymmetric ridge silhouette.
// Hand-authored — no random seeding.
const CONTOURS: string[] = [
  "M 6 18 C 24 16, 52 22, 94 16",
  "M 4 30 C 22 26, 60 36, 96 24",
  "M 8 44 C 32 38, 64 50, 92 36",
  "M 14 58 C 36 50, 66 62, 88 48",
  "M 20 72 C 42 64, 64 76, 82 62",
  "M 28 86 C 46 78, 60 86, 74 76",
];

// Four clean signal paths between anchor points. Each connects
// a point on one contour to a point on another, suggesting an
// AI retrieval route through the terrain.
const PATHS: Path[] = [
  // Path 1 — query enters at bottom-left, routes up through
  // the lower ridge to a mid-elevation anchor.
  { id: "p1", d: "M 12 86 C 28 72, 38 60, 50 50", pulseSlot: 0 },
  // Path 2 — retrieval traces across the mid ridge to the right.
  { id: "p2", d: "M 50 50 C 64 46, 76 40, 88 32", pulseSlot: 1 },
  // Path 3 — interpretation routes up toward the high ridge.
  { id: "p3", d: "M 88 32 C 80 22, 70 18, 58 16", pulseSlot: 2 },
  // Path 4 — recommendation arc — closes the loop back toward
  // the centre.
  { id: "p4", d: "M 58 16 C 44 20, 36 30, 30 42", pulseSlot: 3 },
];

// Anchor points at the start + end of each path. Small static
// dots — no animation, no labels.
const ANCHORS: Array<{ x: number; y: number }> = [
  { x: 12, y: 86 },
  { x: 50, y: 50 },
  { x: 88, y: 32 },
  { x: 58, y: 16 },
  { x: 30, y: 42 },
];

const CONTOUR_STROKE = "oklch(0.62 0.04 230 / 0.30)";
const PATH_STROKE = "oklch(0.78 0.06 230 / 0.50)";
const PATH_STROKE_PULSE = "oklch(0.88 0.10 220 / 0.85)";
const PATH_STROKE_WARM = "oklch(0.82 0.12 70 / 0.65)";
const PATH_STROKE_WARM_PULSE = "oklch(0.88 0.14 65 / 0.95)";
const ANCHOR_FILL = "oklch(0.85 0.06 220 / 0.70)";
const ANCHOR_FILL_WARM = "oklch(0.85 0.12 65 / 0.85)";
const LABEL_FILL = "oklch(0.62 0.018 245 / 0.85)";

const LABELS: Array<{ x: number; y: number; text: string; align: "start" | "middle" | "end" }> = [
  { x: 50, y: 47, text: "TRUST",      align: "middle" },
  { x: 90, y: 30, text: "RETRIEVE",   align: "end" },
  { x: 60, y: 13, text: "RECOMMEND",  align: "middle" },
];

export function HeroVisual() {
  return (
    <svg
      aria-hidden
      role="presentation"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: "100%",
        height: "auto",
        maxWidth: 520,
        aspectRatio: "1 / 1",
      }}
    >
      {/* Subtle radial backdrop behind the terrain. Very low opacity
          so it adds depth without becoming a foreground element. */}
      <defs>
        <radialGradient id="hvBg" cx="55%" cy="45%" r="60%">
          <stop offset="0%"   stopColor="oklch(0.18 0.030 230)" stopOpacity="0.30" />
          <stop offset="60%"  stopColor="oklch(0.10 0.018 248)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="oklch(0.07 0.012 248)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#hvBg)" />

      {/* Corner reference ticks — purely typographic, suggests
          "this is a measurable frame." */}
      <g stroke="oklch(0.50 0.018 245 / 0.32)" strokeWidth="0.18" fill="none" strokeLinecap="round">
        <path d="M 2 2 L 2 7 M 2 2 L 7 2" />
        <path d="M 98 2 L 98 7 M 98 2 L 93 2" />
        <path d="M 2 98 L 2 93 M 2 98 L 7 98" />
        <path d="M 98 98 L 98 93 M 98 98 L 93 98" />
      </g>

      {/* Topographic contour lines */}
      <g stroke={CONTOUR_STROKE} strokeWidth="0.22" fill="none" strokeLinecap="round">
        {CONTOURS.map((d, i) => (
          <path key={`c-${i}`} d={d} />
        ))}
      </g>

      {/* Signal paths — static base layer (always visible).
          p4 (recommendation arc) is the lone warm-accent path. */}
      <g fill="none" strokeLinecap="round">
        {PATHS.map((p) => (
          <path
            key={p.id}
            d={p.d}
            stroke={p.id === "p4" ? PATH_STROKE_WARM : PATH_STROKE}
            strokeWidth={p.id === "p4" ? "0.42" : "0.35"}
          />
        ))}
      </g>

      {/* Signal paths — pulse layer. Each path's pulse animation
          fires once per 12s cycle, staggered by `pulseSlot * 3s`
          so only one path is illuminated at a time. p4 pulses in
          warm amber. */}
      <g fill="none" strokeLinecap="round" opacity="0">
        {PATHS.map((p) => (
          <path
            key={`pulse-${p.id}`}
            d={p.d}
            stroke={p.id === "p4" ? PATH_STROKE_WARM_PULSE : PATH_STROKE_PULSE}
            strokeWidth="0.55"
            className="hero-path-pulse"
            style={{ animationDelay: `${p.pulseSlot * 3}s` }}
          />
        ))}
      </g>

      {/* Static anchor dots at path termini. The recommendation
          node (x:58, y:16) renders in warm amber to anchor the
          warm arc visually. */}
      {ANCHORS.map((a, i) => {
        const isWarm = a.x === 58 && a.y === 16;
        return (
          <circle
            key={`a-${i}`}
            cx={a.x}
            cy={a.y}
            r={isWarm ? 1.1 : 0.85}
            fill={isWarm ? ANCHOR_FILL_WARM : ANCHOR_FILL}
          />
        );
      })}

      {/* Node labels — TRUST / RETRIEVE / RECOMMEND. Mono caps,
          quiet, positioned near anchor termini. */}
      <g fill={LABEL_FILL} fontFamily="ui-monospace, monospace" fontSize="2.1" letterSpacing="0.22em">
        {LABELS.map((l) => (
          <text
            key={l.text}
            x={l.x}
            y={l.y}
            textAnchor={l.align}
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {l.text}
          </text>
        ))}
      </g>

      {/* Restrained mono label — purely positioning, no metric */}
      <text
        x={6}
        y={97}
        fill="oklch(0.55 0.018 245 / 0.55)"
        fontSize={2.2}
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.18em"
      >
        AI VISIBILITY TERRAIN
      </text>
    </svg>
  );
}
