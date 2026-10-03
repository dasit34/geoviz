import { ProviderMark } from "@/components/report/BrandMarks";

/**
 * Decorative radar field behind the hero readout (desktop only). Concentric
 * rings, a slow sweep, and the four AI systems the audit queries via their
 * APIs, each with a short signal line toward the readout. Server-rendered SVG
 * animated with CSS only (no JS cost); every animation is `motion-safe:`, so
 * reduced-motion users get the static field. Cyan is the reserved
 * radar/telemetry accent. No AI Overviews node — it is not queried.
 */

const SIZE = 840;
const C = SIZE / 2;
const RINGS = [150, 240, 330, 410];
const NODE_R = 412;

// Angles (degrees, 0 = right, clockwise) chosen so each node sits just above
// or below the readout card, where it stays visible.
const NODES = [
  { provider: "openai", label: "ChatGPT", angle: -113, delay: "[animation-delay:0s]" },
  { provider: "claude", label: "Claude", angle: -67, delay: "[animation-delay:0.75s]" },
  { provider: "gemini", label: "Gemini", angle: 113, delay: "[animation-delay:1.5s]" },
  { provider: "perplexity", label: "Perplexity", angle: 67, delay: "[animation-delay:2.25s]" },
] as const;

function polar(r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

export function HeroSignalField() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[840px] w-[840px] -translate-x-1/2 -translate-y-1/2 lg:block">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
        {RINGS.map((r, i) => (
          <circle
            key={r}
            cx={C}
            cy={C}
            r={r}
            fill="none"
            className={i === RINGS.length - 1 ? "stroke-cyan/20" : "stroke-white/[0.06]"}
            strokeWidth="1"
            strokeDasharray={i === RINGS.length - 1 ? "2 6" : undefined}
          />
        ))}
        {/* Sweep: a narrow wedge plus a leading edge, rotating about the centre. */}
        <g className="motion-safe:animate-radarSweep [transform-origin:420px_420px]">
          <path d={`M${C} ${C} L${C + NODE_R} ${C} A${NODE_R} ${NODE_R} 0 0 0 ${polar(NODE_R, -24).x} ${polar(NODE_R, -24).y} Z`} className="fill-cyan/[0.05]" />
          <line x1={C} y1={C} x2={C + NODE_R} y2={C} className="stroke-cyan/30" strokeWidth="1" />
        </g>
        {NODES.map((n) => {
          const from = polar(NODE_R - 14, n.angle);
          const to = polar(RINGS[1], n.angle);
          return (
            <line
              key={n.provider}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              strokeWidth="1"
              strokeDasharray="3 4"
              className={`stroke-cyan/40 motion-safe:animate-signalDash ${n.delay}`}
            />
          );
        })}
      </svg>
      {NODES.map((n) => {
        const p = polar(NODE_R, n.angle);
        return (
          <span
            key={n.provider}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-cyan/25 bg-ink-950/90 py-1 pl-1.5 pr-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60 motion-safe:animate-pulseSoft ${n.delay}`}
            style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }}
          >
            <ProviderMark provider={n.provider} size={13} />
            {n.label}
          </span>
        );
      })}
    </div>
  );
}
