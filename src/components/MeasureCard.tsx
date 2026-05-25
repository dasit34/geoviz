/**
 * MeasureCard — one of five "What GeoViz measures" cards.
 *
 * Light-surface card with inline SVG icon, verb headline, and a
 * question. Status rail at the bottom shows the three-state
 * outcome framework (Clear / Weak / Missing).
 *
 * Server component. No client state.
 */

import type { ReactNode } from "react";

export type MeasureCardProps = {
  verb: "Interpret" | "Retrieve" | "Trust" | "Cite" | "Recommend";
  question: string;
  icon: ReactNode;
  /**
   * "warm" → amber-tinted icon halo (the default; up to 4 of 5).
   * "cool" → cyan-tinted icon halo (max 1 per viewport per
   * CLAUDE_DESIGN's "one accent per viewport" rule).
   */
  accent?: "warm" | "cool";
  className?: string;
};

export function MeasureCard({
  verb,
  question,
  icon,
  accent = "warm",
  className,
}: MeasureCardProps) {
  const haloColor =
    accent === "cool" ? "text-cyan-DEFAULT" : "text-accent-glow";

  return (
    <div
      className={[
        "card-light p-5 sm:p-6 flex flex-col gap-4",
        "transition-shadow duration-200 hover:shadow-[0_2px_0_rgba(0,0,0,0.02),0_32px_70px_-40px_rgba(14,18,24,0.32)]",
        className ?? "",
      ].join(" ")}
    >
      {/* Icon + verb */}
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className={[
            "shrink-0 inline-flex items-center justify-center",
            "h-10 w-10 rounded-md",
            "border border-cream-200",
            "bg-cream-50",
            haloColor,
          ].join(" ")}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="h3-light text-base sm:text-lg font-semibold leading-tight">
            {verb}
          </h3>
          <p className="muted-light mt-1 text-[12px] uppercase tracking-[0.18em] font-mono">
            Question
          </p>
        </div>
      </div>

      {/* Question */}
      <p className="lede-light text-[15px] leading-snug">{question}</p>

      {/* Status rail — 3-state outcome chart. */}
      <div className="mt-auto pt-4 border-t border-cream-200">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-severity-info" aria-hidden="true" />
          <span className="muted-light text-[11px] uppercase tracking-[0.18em] font-mono">
            Clear
          </span>
          <span className="text-cream-300 px-1" aria-hidden="true">/</span>
          <span className="h-1.5 w-1.5 rounded-full bg-severity-warning" aria-hidden="true" />
          <span className="muted-light text-[11px] uppercase tracking-[0.18em] font-mono">
            Weak
          </span>
          <span className="text-cream-300 px-1" aria-hidden="true">/</span>
          <span className="h-1.5 w-1.5 rounded-full bg-severity-critical" aria-hidden="true" />
          <span className="muted-light text-[11px] uppercase tracking-[0.18em] font-mono">
            Missing
          </span>
        </div>
      </div>
    </div>
  );
}
