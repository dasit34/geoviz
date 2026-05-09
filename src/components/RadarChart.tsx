import type { ScoreCategory } from "@/lib/parse-report";

/**
 * Pure-SVG radar chart of the 6 rubric categories. Lightweight (no
 * library deps), deterministic (axes/positions are a function of the
 * category list, identical across every report), and print-safe (SVG
 * scales cleanly to PDF). Shows all six dimensions at a glance so the
 * customer sees the shape of their score before reading the cards
 * underneath.
 *
 * Data invariant: this component renders ONLY what `score.categories`
 * contains. Missing scores collapse to 0 (drawn at the chart center).
 * Never extrapolates, never invents.
 */
export function RadarChart({ categories }: { categories: ScoreCategory[] }) {
  if (categories.length < 3) {
    // A radar with < 3 axes is meaningless; fail closed silently
    // rather than render something misleading.
    return null;
  }

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 56; // leave room for outer labels
  const n = categories.length;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const dataPoints = categories.map((cat, i) => {
    const ratio = typeof cat.score === "number" ? cat.score / cat.max : 0;
    const r = maxRadius * Math.max(0, Math.min(1, ratio));
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

  const labelPoints = categories.map((cat, i) => {
    const a = angleFor(i);
    return {
      x: cx + (maxRadius + 22) * Math.cos(a),
      y: cy + (maxRadius + 22) * Math.sin(a),
      text: cat.short,
    };
  });

  // Background concentric rings at 25 / 50 / 75 / 100 % of max.
  const ringRatios = [0.25, 0.5, 0.75, 1.0];
  const rings = ringRatios.map((ratio) =>
    categories
      .map((_, i) => {
        const a = angleFor(i);
        const r = maxRadius * ratio;
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      })
      .join(" "),
  );

  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="radar-chart"
      role="img"
      aria-label="Six-dimension category score radar chart"
    >
      {rings.map((points, i) => (
        <polygon
          key={i}
          points={points}
          className={`radar-chart-ring radar-chart-ring-${i}`}
        />
      ))}
      {categories.map((_, i) => {
        const a = angleFor(i);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + maxRadius * Math.cos(a)}
            y2={cy + maxRadius * Math.sin(a)}
            className="radar-chart-axis"
          />
        );
      })}
      <polygon points={dataPath} className="radar-chart-data" />
      {dataPoints.map((p, i) => (
        <circle
          key={`d-${i}`}
          cx={p.x}
          cy={p.y}
          r={3.2}
          className="radar-chart-data-point"
        />
      ))}
      {labelPoints.map((lp, i) => (
        <text
          key={`lbl-${i}`}
          x={lp.x}
          y={lp.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="radar-chart-label"
        >
          {lp.text}
        </text>
      ))}
    </svg>
  );
}
