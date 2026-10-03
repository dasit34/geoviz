"use client";

import { LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

/**
 * Motion provider for marketing pages. LazyMotion loads the `domAnimation`
 * feature bundle asynchronously (outside first-load JS); components use
 * `m.*`, never `motion.*`. `reducedMotion="user"` makes every transform
 * animation respect prefers-reduced-motion automatically.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
