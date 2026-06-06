/**
 * GeoViz constellation mark — Brand System v2 (AI Visibility Network).
 *
 * Reads, in order: (1) a network constellation — nodes on a ring joined
 * by edges; (2) a signal aperture — a near-complete circle opening on the
 * right; (3) a letter G — the orange signal bar reaching from the hub into
 * the aperture. Deliberately REPLACES the old magnifying glass.
 *
 * Two cuts, auto-selected by size so it survives 16px → 560px:
 *  - `full`    (≥ ~30px): a continuous ring arc (the unmistakable C) with
 *              constellation nodes sitting ON it + a bold orange crossbar
 *              into the aperture (the G bar). Faint interior spokes give
 *              the "network" read without crossing the opening.
 *  - `compact` (≤ ~28px): bold C arc + orange crossbar + hub — a clean
 *              "G" that survives as a favicon / app icon.
 * `variant` forces a cut; default `auto` picks by `size`.
 *
 * `mono` → currentColor (watermark / single-ink). `animated` → radar
 * sweep + node pulse (motion-safe; degrades to a static frame in PDF and
 * under prefers-reduced-motion). Pure inline SVG, no icon packages.
 */

const C = 24; // center
const R = 15; // ring radius

// Brand v2 palette (mirrors --gv-* tokens; literals so the mark is portable).
const BRAND = {
  signal: "#FF6A1A", // the one GeoViz orange
  node: "#E2E8F0", // paper-white nodes
  nodeDim: "#7C8598", // graphite nodes
  ring: "rgba(226,232,240,0.55)", // the C arc
  edgeFaint: "rgba(226,232,240,0.20)", // interior spokes
};

type Pt = { x: number; y: number };
const polar = (deg: number, r = R): Pt => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};

// Aperture: ring spans 42° → 318° the long way (through bottom/left/top),
// leaving an ~84° opening on the right. Nodes sit ON the arc.
const ARC_START = 42;
const ARC_END = 318;
const NODE_ANGLES = [42, 97, 152, 207, 262, 318];
const NODES: Pt[] = NODE_ANGLES.map((a) => polar(a));
const MOUTH: Pt = { x: C + 11, y: C }; // crossbar terminus, centered in the opening
const HUB: Pt = { x: C, y: C };

function ringPath(): string {
  const a = polar(ARC_START);
  const b = polar(ARC_END);
  // large-arc=1, sweep=1 → clockwise the long way (the C opening on the right)
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 1 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function GeoVizMark({
  size = 32,
  mono = false,
  animated = false,
  variant = "auto",
  className = "",
}: {
  size?: number;
  mono?: boolean;
  animated?: boolean;
  variant?: "auto" | "full" | "compact";
  className?: string;
}) {
  const cut = variant === "auto" ? (size <= 28 ? "compact" : "full") : variant;

  const ring = mono ? "currentColor" : BRAND.ring;
  const edgeFaint = mono ? "currentColor" : BRAND.edgeFaint;
  const node = mono ? "currentColor" : BRAND.node;
  const nodeDim = mono ? "currentColor" : BRAND.nodeDim;
  const hub = mono ? "currentColor" : BRAND.signal;
  const mouth = mono ? "currentColor" : BRAND.signal;

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    "aria-hidden": true as const,
    className: `gv-mark${className ? ` ${className}` : ""}`,
  };

  if (cut === "compact") {
    return (
      <svg {...common}>
        {/* the C — bold ring arc opening on the right */}
        <path
          d={ringPath()}
          stroke={node}
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
        />
        {/* crossbar into the aperture (the G bar) */}
        <line
          x1={HUB.x}
          y1={HUB.y}
          x2={MOUTH.x + 1}
          y2={HUB.y}
          stroke={mouth}
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        {/* hub */}
        <circle cx={HUB.x} cy={HUB.y} r="4.1" fill={hub} />
      </svg>
    );
  }

  // FULL — continuous C arc + constellation nodes on it + interior spokes
  // + bold orange G bar.
  return (
    <svg {...common}>
      {/* the C — one continuous arc = the unmistakable circle/aperture */}
      <path d={ringPath()} stroke={ring} strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* faint interior spokes (network read; never cross the opening) */}
      <g stroke={edgeFaint} strokeWidth="1.1">
        <line x1={HUB.x} y1={HUB.y} x2={NODES[1].x} y2={NODES[1].y} />
        <line x1={HUB.x} y1={HUB.y} x2={NODES[2].x} y2={NODES[2].y} />
        <line x1={HUB.x} y1={HUB.y} x2={NODES[4].x} y2={NODES[4].y} />
      </g>

      {/* optional radar sweep (web only; static in PDF / reduced-motion) */}
      {animated ? (
        <line
          x1={C}
          y1={C}
          x2={C + R}
          y2={C}
          stroke={hub}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.45"
          className="origin-center motion-safe:animate-radarSweep"
        />
      ) : null}

      {/* constellation nodes sitting ON the ring */}
      {NODES.map((p, i) => (
        <circle
          key={`n${i}`}
          cx={p.x}
          cy={p.y}
          r={i % 2 === 0 ? 2.4 : 2.0}
          fill={i % 3 === 1 ? nodeDim : node}
          className={animated ? "motion-safe:animate-pulseSoft" : undefined}
        />
      ))}

      {/* the G bar — bold orange crossbar from hub into the aperture */}
      <line
        x1={HUB.x}
        y1={HUB.y}
        x2={MOUTH.x}
        y2={HUB.y}
        stroke={mouth}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={MOUTH.x} cy={MOUTH.y} r="2.3" fill={mouth} />
      <circle cx={HUB.x} cy={HUB.y} r="3.4" fill={hub} />
    </svg>
  );
}

export { GeoVizMark };
export default GeoVizMark;
