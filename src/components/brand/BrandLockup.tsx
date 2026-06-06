/**
 * BrandLockup — the canonical GeoViz v2 lockup: constellation mark +
 * "GeoViz" wordmark (Space Grotesk, single sentence-case casing) +
 * optional mono strap. ONE lockup to replace the three divergent
 * wordmarks (header system-sans / footer Instrument-Serif / report
 * Poppins) found in the brand audit.
 *
 * Phase 1: showcased on /brandpreview only. Phases 2–3 wire it into the
 * header/footer/report so every surface shares one identity.
 */
import { GeoVizMark } from "@/components/brand/GeoVizMark";

export function BrandLockup({
  markSize = 36,
  wordClass = "text-[26px]",
  strap = true,
  animated = false,
  className = "",
}: {
  markSize?: number;
  wordClass?: string;
  strap?: boolean;
  animated?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <GeoVizMark size={markSize} animated={animated} />
      <span className="inline-flex flex-col leading-none">
        <span
          className={`font-gv-display font-semibold leading-none tracking-[-0.01em] text-white ${wordClass}`}
        >
          GeoViz<span className="text-[color:var(--gv-signal)]">.ai</span>
        </span>
        {strap ? (
          <span className="font-gv-mono mt-1.5 text-[8.5px] font-semibold uppercase tracking-[0.3em] text-white/40">
            AI Visibility Intelligence
          </span>
        ) : null}
      </span>
    </span>
  );
}
