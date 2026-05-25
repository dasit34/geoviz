import Link from "next/link";

/**
 * GeoViz wordmark · publication-imprint refactor.
 *
 * The previous Logo carried a small SVG mark + wordmark. The
 * reference-driven hero asks the logo to read as a *publication
 * imprint* rather than an app icon: pure typography, confident
 * scale, with a small intelligence-brief strap underneath. Used
 * by Header and Footer; signature unchanged.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="GeoViz — AI Visibility Intelligence"
      className={`inline-flex flex-col gap-1 leading-none text-white ${className}`}
    >
      <span className="font-display text-2xl font-semibold tracking-[0.02em]">
        GEOVIZ<span className="text-white/35">.ai</span>
      </span>
      <span className="mono-data text-[9px] font-semibold uppercase tracking-[0.3em] text-white/35">
        AI Visibility Intelligence
      </span>
    </Link>
  );
}
