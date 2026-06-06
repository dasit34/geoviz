import type { Tone } from "@/lib/report/report-model";

/**
 * Inline-SVG brand marks for the report (no icon/logo packages, per the
 * GeoViz figma rules).
 *
 * `GeoVizMark` is the canonical Brand System v2 constellation mark — it is
 * re-exported from the shared brand module so the report cover, watermark,
 * section markers, and footer all render the SAME identity as the website,
 * favicon, OG image, and email lockups. (The old report-only magnifying
 * glass is retired.) Its props are `size` / `mono` / `animated` / `variant`.
 *
 * The four AI-platform marks are clean, distinct, brand-colored glyphs
 * (stylized, not pixel-exact trademarks). `ScoreGauge` is a 270° arc
 * dial for an at-a-glance score read.
 */

export { GeoVizMark } from "@/components/brand/GeoVizMark";

const PROVIDER_COLOR: Record<string, string> = {
  openai: "#10a37f", // ChatGPT green
  claude: "#d97757", // Anthropic clay
  gemini: "#4285f4", // Google blue
  perplexity: "#20b8cd", // Perplexity teal
};

export function providerColor(provider: string): string {
  return PROVIDER_COLOR[provider] ?? "#8a92a3";
}

export function ProviderMark({
  provider,
  size = 22,
}: {
  provider: string;
  size?: number;
}) {
  const c = providerColor(provider);
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
  };
  switch (provider) {
    case "openai":
      // OpenAI hexafoil knot — three interlocking rounded loops at 0/60/120°.
      return (
        <svg {...common}>
          <g stroke={c} strokeWidth="1.5" fill="none" strokeLinejoin="round">
            <rect x="4.5" y="9.4" width="15" height="5.2" rx="2.6" />
            <rect x="4.5" y="9.4" width="15" height="5.2" rx="2.6" transform="rotate(60 12 12)" />
            <rect x="4.5" y="9.4" width="15" height="5.2" rx="2.6" transform="rotate(120 12 12)" />
          </g>
        </svg>
      );
    case "claude":
      // Sunburst / asterisk — Anthropic-style radial rays.
      return (
        <svg {...common}>
          <g stroke={c} strokeWidth="1.6" strokeLinecap="round">
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (Math.PI * 2 * i) / 12;
              const r0 = 3.4;
              const r1 = 10;
              return (
                <line
                  key={i}
                  x1={12 + r0 * Math.cos(a)}
                  y1={12 + r0 * Math.sin(a)}
                  x2={12 + r1 * Math.cos(a)}
                  y2={12 + r1 * Math.sin(a)}
                />
              );
            })}
          </g>
        </svg>
      );
    case "gemini":
      // Four-point sparkle (Gemini star).
      return (
        <svg {...common}>
          <path
            d="M12 1.5 C12.6 6.6 17.4 11.4 22.5 12 C17.4 12.6 12.6 17.4 12 22.5 C11.4 17.4 6.6 12.6 1.5 12 C6.6 11.4 11.4 6.6 12 1.5 Z"
            fill={c}
          />
        </svg>
      );
    case "perplexity":
      // Stylized loop / node mark.
      return (
        <svg {...common}>
          <g stroke={c} strokeWidth="1.6" fill="none">
            <path d="M12 3 L12 21" />
            <path d="M12 7 C6 7 4 10 4 12 C4 14 6 17 12 17" />
            <path d="M12 7 C18 7 20 10 20 12 C20 14 18 17 12 17" />
          </g>
          <circle cx="12" cy="12" r="1.6" fill={c} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.6" />
        </svg>
      );
  }
}

const TONE_HEX: Record<Tone, string> = {
  ok: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
  muted: "rgba(255,255,255,0.4)",
};

/**
 * 270° arc gauge. `value` 0–100. Mono number centered.
 */
export function ScoreGauge({
  value,
  tone,
  size = 132,
}: {
  value: number | null;
  tone: Tone;
  size?: number;
}) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const stroke = 9;
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  // 270° sweep starting at 135° (bottom-left) going clockwise.
  const start = 135;
  const sweep = 270;
  const polar = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = polar(fromDeg);
    const [x2, y2] = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const valDeg = start + (sweep * v) / 100;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="rd-gauge"
    >
      <path
        d={arc(start, start + sweep)}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {v > 0 ? (
        <path
          d={arc(start, valDeg)}
          fill="none"
          stroke={TONE_HEX[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      ) : null}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rd-gauge-num"
        fill={TONE_HEX[tone]}
      >
        {value === null ? "—" : value}
      </text>
      <text
        x={cx}
        y={cy + 20}
        textAnchor="middle"
        dominantBaseline="central"
        className="rd-gauge-max"
      >
        / 100
      </text>
    </svg>
  );
}
