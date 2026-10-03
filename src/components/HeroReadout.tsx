"use client";

import { m, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { ModelResultCard } from "@/components/ModelResultCard";
import {
  EXAMPLE_AI_OVERVIEWS_READINESS,
  EXAMPLE_BAND,
  EXAMPLE_BUSINESS,
  EXAMPLE_CATEGORIES,
  EXAMPLE_MODEL_RESULTS,
  EXAMPLE_SCORE,
} from "@/lib/home/example-data";

const EASE = [0.22, 1, 0.36, 1] as const;
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

/** rAF count-up (no animation library cost); instant under reduced motion. */
function useCountUp(target: number, delayMs: number, durationMs: number, instant: boolean) {
  const [value, setValue] = useState(instant ? target : 0);
  useEffect(() => {
    if (instant) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs, durationMs, instant]);
  return value;
}

/**
 * Hero signature sequence — an AI visibility readout assembling itself:
 * score ring + count-up → category bars → four AI-system results →
 * derived readiness. Runs once. EXAMPLE DATA (fictional business),
 * persistently badged.
 */
export function HeroReadout() {
  const reduce = useReducedMotion() ?? false;
  const score = useCountUp(EXAMPLE_SCORE, 350, 1100, reduce);
  const ringTarget = RING_C * (1 - EXAMPLE_SCORE / 100);

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative rounded-lg border border-white/10 bg-ink-900/80 p-4 shadow-card backdrop-blur sm:p-6"
      aria-label={`Example AI visibility readout for ${EXAMPLE_BUSINESS.name}: score ${EXAMPLE_SCORE} of 100, ${EXAMPLE_BAND}.`}
      role="figure"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
          AI visibility readout · {EXAMPLE_BUSINESS.name}
        </p>
        <ExampleDataBadge />
      </div>

      <div className="mt-5 grid grid-cols-[auto,1fr] items-center gap-5 sm:gap-7">
        <div className="relative h-[124px] w-[124px] sm:h-[136px] sm:w-[136px]">
          <svg viewBox="0 0 124 124" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="62" cy="62" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            <m.circle
              cx="62"
              cy="62"
              r={RING_R}
              fill="none"
              stroke="url(#heroRing)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              initial={reduce ? false : { strokeDashoffset: RING_C }}
              animate={{ strokeDashoffset: ringTarget }}
              transition={{ delay: 0.35, duration: 1.1, ease: EASE }}
            />
            <defs>
              <linearGradient id="heroRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff8a3c" />
                <stop offset="100%" stopColor="#ff6a1a" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-4xl font-semibold tabular-nums text-white sm:text-[2.6rem]" aria-hidden>
              {score}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">of 100</span>
          </div>
        </div>

        <div>
          <p className="text-sm text-white/80">
            <span className="font-semibold text-accent-glow">{EXAMPLE_BAND}</span>
            <span className="text-white/55"> · directional, from website evidence</span>
          </p>
          <ul className="mt-3 space-y-2" aria-label="Category scores (example)">
            {EXAMPLE_CATEGORIES.map((c, i) => {
              const pct = Math.round((c.points / c.max) * 100);
              return (
                <li key={c.key} className="grid grid-cols-[1fr,auto] items-center gap-x-3 gap-y-1 text-[12px] text-white/60 sm:grid-cols-[150px,1fr]">
                  <span>{c.label}</span>
                  <span className="relative h-1.5 w-full min-w-[80px] overflow-hidden rounded-full bg-white/[0.07] max-sm:col-span-2 max-sm:row-start-2">
                    <m.span
                      className="absolute inset-y-0 left-0 rounded-full bg-white/70"
                      style={{ width: `${pct}%`, originX: 0 }}
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.55 + i * 0.07, duration: 0.6, ease: EASE }}
                    />
                  </span>
                  <span className="sr-only">{pct}% of category maximum</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">
        How four AI systems read this business · via their APIs
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {EXAMPLE_MODEL_RESULTS.map((r, i) => (
          <m.li
            key={r.provider}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.25 + i * 0.07, duration: 0.45, ease: EASE }}
          >
            <ModelResultCard result={r} />
          </m.li>
        ))}
      </ul>

      <m.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.65, duration: 0.5 }}
        className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-white/[0.08] pt-3 text-[12px]"
      >
        <span className="text-white/70">
          Google AI Overviews readiness{" "}
          <span className="font-mono tabular-nums text-white">{EXAMPLE_AI_OVERVIEWS_READINESS}</span>
        </span>
        <span className="text-white/55">Derived from website signals — not a model query</span>
      </m.div>
    </m.div>
  );
}
