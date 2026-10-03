"use client";

import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";

/**
 * Gives a product preview physical depth: it eases from a slight tilt to
 * flat as it scrolls into view. Static under reduced motion.
 */
export function DashboardPreview({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center 60%"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [9, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [36, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.45], [0.35, 1]);

  return (
    <div ref={ref} style={{ perspective: 1400 }} role="figure" aria-label={label}>
      <m.div
        style={reduce ? undefined : { rotateX, y, opacity, transformOrigin: "50% 100%" }}
        className="rounded-lg border border-white/10 bg-ink-900/90 shadow-card"
      >
        {children}
      </m.div>
    </div>
  );
}
