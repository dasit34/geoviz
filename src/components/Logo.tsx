import Link from "next/link";

import { GeoVizMark } from "@/components/brand/GeoVizMark";

/**
 * Logo — the canonical GeoViz lockup (Brand System v2): the constellation
 * mark + "GeoViz.ai" wordmark in the display face (Space Grotesk, wired
 * via Tailwind `font-display`) + a mono strap. ONE lockup, one casing,
 * used site-wide so the header/footer/report read as a single brand.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="GeoViz — AI Visibility Intelligence"
      className={`inline-flex items-center gap-2.5 text-white sm:gap-3.5 ${className}`}
    >
      <GeoVizMark
        size={50}
        className="h-[38px] w-[38px] sm:h-[50px] sm:w-[50px]"
      />
      <span className="inline-flex flex-col leading-none">
        <span className="font-display text-[20px] font-semibold leading-none tracking-[-0.01em] sm:text-[30px]">
          GeoViz<span className="text-[color:var(--gv-signal)]">.ai</span>
        </span>
        <span className="mono-data mt-1.5 hidden text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45 sm:block">
          AI Visibility Intelligence
        </span>
      </span>
    </Link>
  );
}
