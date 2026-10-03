"use client";

import { m, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";

export type LoopStep = { key: string; label: string; line: string; href: string };

function StepRow({ step, index, total, progress }: { step: LoopStep; index: number; total: number; progress: MotionValue<number> }) {
  const at = index / total;
  const opacity = useTransform(progress, [Math.max(0, at - 0.12), at + 0.02], [0.45, 1]);
  const dot = useTransform(progress, [Math.max(0, at - 0.12), at + 0.02], [0.6, 1]);
  return (
    <m.li style={{ opacity }} className="relative grid grid-cols-[28px,1fr] gap-4 pb-9 last:pb-0">
      <m.span
        aria-hidden
        style={{ scale: dot }}
        className="relative z-10 mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-accent/50 bg-ink-950 font-mono text-[11px] text-accent"
      >
        {index + 1}
      </m.span>
      <div>
        <a href={step.href} className="font-display text-2xl font-semibold text-white transition hover:text-accent-glow">
          {step.label}
        </a>
        <p className="mt-1 max-w-md text-[15px] leading-relaxed text-white/65">{step.line}</p>
      </div>
    </m.li>
  );
}

/**
 * Audit → Monitor → Compare → Improve → Prove with a scroll-linked
 * progress rail (desktop). Under reduced motion the rail is simply full
 * and every step is fully visible.
 */
export function LoopProgress({ steps }: { steps: LoopStep[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 45%"] });
  const complete = useMotionValue(1);
  const progress = reduce ? complete : scrollYProgress;

  return (
    <ol ref={ref} className="relative" aria-label="How GeoViz works, step by step">
      <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-white/10" />
      <m.span
        aria-hidden
        className="absolute left-[13px] top-3 w-px origin-top bg-gradient-to-b from-accent to-accent-glow"
        style={{ scaleY: progress, bottom: 12 }}
      />
      {steps.map((s, i) => (
        <StepRow key={s.key} step={s} index={i} total={steps.length} progress={progress} />
      ))}
    </ol>
  );
}
