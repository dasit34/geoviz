"use client";

import { m, useReducedMotion } from "framer-motion";

import { EXAMPLE_COMPETITOR_PRESENCE, EXAMPLE_SCORE_HISTORY } from "@/lib/home/example-data";

const EASE = [0.22, 1, 0.36, 1] as const;
const VIEW = { once: true, amount: 0.5 } as const;

// Chart geometry (SVG user units). The y-axis is labelled, so the 40–70 range is explicit.
const W = 320;
const H = 170;
const PAD = { l: 30, r: 16, t: 22, b: 30 };
const Y_MIN = 40;
const Y_MAX = 70;
const Y_TICKS = [40, 50, 60, 70];

const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (EXAMPLE_SCORE_HISTORY.length - 1);
const y = (v: number) => PAD.t + ((Y_MAX - v) * (H - PAD.t - PAD.b)) / (Y_MAX - Y_MIN);

/** Score history from reviewed audits, drawn as a line that traces in on view. */
export function ScoreHistoryChart() {
  const reduce = useReducedMotion() ?? false;
  const pts = EXAMPLE_SCORE_HISTORY.map((h, i) => ({ ...h, cx: x(i), cy: y(h.score) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.cx} ${p.cy}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].cx} ${H - PAD.b} L${pts[0].cx} ${H - PAD.b} Z`;
  const first = EXAMPLE_SCORE_HISTORY[0].score;
  const last = EXAMPLE_SCORE_HISTORY[EXAMPLE_SCORE_HISTORY.length - 1].score;

  return (
    <div>
      <p className="mt-4 text-[13px] text-graphite-700">
        <span className="font-mono text-lg font-semibold tabular-nums text-graphite-900">+{last - first}</span> points since
        the starting audit
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" aria-hidden>
        {Y_TICKS.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-graphite-400/25" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(t) + 3.5} textAnchor="end" className="fill-graphite-500 font-mono text-[9px]">
              {t}
            </text>
          </g>
        ))}
        <m.path
          d={area}
          className="fill-accent/10"
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={VIEW}
          transition={{ delay: 0.6, duration: 0.6 }}
        />
        <m.path
          d={line}
          fill="none"
          className="stroke-accent"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={VIEW}
          transition={{ duration: 1.1, ease: EASE }}
        />
        {pts.map((p, i) => (
          <m.g
            key={p.label}
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={VIEW}
            transition={{ delay: 0.15 + i * 0.4, duration: 0.3 }}
          >
            <circle cx={p.cx} cy={p.cy} r="4.5" className="fill-cream-50 stroke-accent" strokeWidth="2" />
            <text x={p.cx} y={p.cy - 10} textAnchor="middle" className="fill-graphite-900 font-mono text-[11px] font-semibold">
              {p.score}
            </text>
            <text x={p.cx} y={H - 10} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} className="fill-graphite-500 text-[10px]">
              {p.label}
            </text>
          </m.g>
        ))}
      </svg>
      <ol className="sr-only" aria-label="Example score history">
        {EXAMPLE_SCORE_HISTORY.map((h) => (
          <li key={h.label}>
            {h.label}: {h.score}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Presence in answers to the same tracked questions; bars grow on view. */
export function PresenceBars() {
  const reduce = useReducedMotion() ?? false;
  return (
    <ul className="mt-6 space-y-4" aria-label="Example competitor presence">
      {EXAMPLE_COMPETITOR_PRESENCE.map((c, i) => (
        <li key={c.name}>
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className={c.isCustomer ? "font-semibold text-graphite-900" : "text-graphite-700"}>{c.name}</span>
            <span className="font-mono tabular-nums text-graphite-700">
              {c.mentioned} of {c.measured}
            </span>
          </div>
          <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-graphite-400/15">
            <m.span
              className={`block h-full rounded-full ${c.isCustomer ? "bg-accent" : "bg-graphite-500/60"}`}
              style={{ width: `${(c.mentioned / c.measured) * 100}%`, originX: 0 }}
              initial={reduce ? false : { scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={VIEW}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.7, ease: EASE }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
