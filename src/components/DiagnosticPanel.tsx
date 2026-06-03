/**
 * DiagnosticPanel — hero diagnostic visual.
 *
 * Sample data only. Never reads from real audits, never accepts
 * customer data, never fakes a brand logo. Pure server component.
 *
 * Mirrors the visual language of `ReportScoreCard` / `CategoryScoreCard`
 * (mono labels, status chips, restrained borders) so the homepage
 * hero reads identically to the real report.
 */

type ChipKind = "clear" | "strong" | "weak" | "missing" | "review";

type Row = {
  label: string;
  caption: string;
  chip: ChipKind;
};

const SAMPLE_ROWS: Row[] = [
  {
    label: "Business Profile",
    caption: "Name, location, services parsed cleanly.",
    chip: "clear",
  },
  {
    label: "Entity Clarity",
    caption: "Schema identifies the business and its category.",
    chip: "strong",
  },
  {
    label: "Crawlability",
    caption: "robots.txt allows AI systems; sitemap present.",
    chip: "clear",
  },
  {
    label: "Trust Signals",
    caption: "NAP consistent across schema and footer.",
    chip: "weak",
  },
  {
    label: "Citation Readiness",
    caption: "No FAQ schema; thin service-page depth.",
    chip: "missing",
  },
  {
    label: "Recommendation Readiness",
    caption: "Content density adequate; review signal mixed.",
    chip: "review",
  },
];

const CHIP_LABEL: Record<ChipKind, string> = {
  clear: "Clear",
  strong: "Strong",
  weak: "Weak",
  missing: "Missing",
  review: "Needs review",
};

export function DiagnosticPanel({ className }: { className?: string }) {
  return (
    <div
      className={[
        "relative w-full rounded-lg border border-white/10",
        "bg-ink-900/70 backdrop-blur-sm shadow-card",
        "p-6 sm:p-7",
        className ?? "",
      ].join(" ")}
      aria-label="Sample AI visibility diagnostic — directional"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/8">
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-accent shadow-glow animate-pulseSoft shrink-0"
          />
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/45 truncate">
              Sample Business · Diagnostic
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white truncate">
              acme-plumbing.example
            </div>
          </div>
        </div>
        <span className="status-chip status-chip-review shrink-0">
          Sample · directional
        </span>
      </div>

      {/* Rows */}
      <ul className="mt-4 divide-y divide-white/[0.06]">
        {SAMPLE_ROWS.map((row) => (
          <li key={row.label} className="flex items-start gap-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-white/90 truncate">
                {row.label}
              </div>
              <div className="mt-0.5 text-[12px] text-white/55 leading-snug">
                {row.caption}
              </div>
            </div>
            <span
              className={`status-chip status-chip-${row.chip} shrink-0 mt-0.5`}
            >
              {CHIP_LABEL[row.chip]}
            </span>
          </li>
        ))}
      </ul>

      {/* Footer hairline */}
      <div className="mt-4 pt-3 border-t border-white/8 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
          GeoViz · sample preview
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
          6 / 6 surfaces
        </span>
      </div>
    </div>
  );
}
