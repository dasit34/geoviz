"use client";

import { m, useTransform, type MotionValue } from "framer-motion";

export type LoopGlyphKind = "audit" | "monitor" | "compare" | "improve" | "prove";

// Each glyph: a faint static base plus accent strokes that draw in.
const GLYPHS: Record<LoopGlyphKind, { base: string[]; draw: string[] }> = {
  audit: {
    base: ["M24 6a18 18 0 1 1 0 36a18 18 0 1 1 0-36"],
    draw: ["M24 6a18 18 0 1 1 -17.1 23.6", "M24 24l7-6", "M22.5 24a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0"],
  },
  monitor: {
    base: ["M9 12h30v26H9z", "M9 19h30"],
    draw: ["M16 8v7", "M32 8v7", "M15 27h4", "M22 27h4", "M29 27h4", "M15 33h4"],
  },
  compare: {
    base: ["M8 40h32", "M8 8v32"],
    draw: ["M11 33l8-7 8 3 11-14", "M11 30l8 2 8 3 11-2"],
  },
  improve: {
    base: ["M22 14h16", "M22 25h16", "M22 36h16"],
    draw: ["M9 14l3 3 5-6", "M9 25l3 3 5-6", "M9 32h7v7H9z"],
  },
  prove: {
    base: ["M6 10h15v24H6z", "M27 10h15v24H27z"],
    draw: ["M21 22h6", "M30 22l3 3 6-7", "M9 16h9", "M9 21h6"],
  },
};

/** Small step illustration whose accent strokes draw in as the loop rail reaches it. */
export function LoopGlyph({ kind, progress, at }: { kind: LoopGlyphKind; progress: MotionValue<number>; at: number }) {
  const pathLength = useTransform(progress, [Math.max(0, at - 0.16), at + 0.04], [0, 1]);
  const g = GLYPHS[kind];
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {g.base.map((d) => (
        <path key={d} d={d} className="stroke-white/15" strokeWidth="1.5" />
      ))}
      {g.draw.map((d) => (
        <m.path key={d} d={d} className="stroke-accent" strokeWidth="1.8" style={{ pathLength }} />
      ))}
    </svg>
  );
}
