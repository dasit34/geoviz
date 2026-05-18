/**
 * Sample Audit mini score panel — sits next to the HeroRadar in
 * the homepage hero. Visual artifact only; not real data.
 *
 * Designed (PR #28) to make the hero composition feel like a
 * "telemetry suite" — radar + score readout side-by-side — rather
 * than just a radar floating alone. The "SAMPLE AUDIT" eyebrow is
 * explicit so visitors don't think this is their score.
 *
 * Anatomy (top → bottom):
 *   1. Eyebrow — "SAMPLE AUDIT" mono cyan
 *   2. Score block — 48px amber mono number + /100 + status band
 *   3. 4 mini horizontal score bars (decorative — fixed values)
 *   4. Footer — mono audit-date stamp
 *
 * All values hardcoded; this is decorative-but-intentional. The
 * customer's real score lives on /report/[id]/print via the
 * ReportScoreCard component.
 */

const SAMPLE_DIMENSIONS = [
  { name: "Schema", value: 42 },
  { name: "Entity", value: 51 },
  { name: "Crawlability", value: 38 },
  { name: "AI Readability", value: 55 },
] as const;

export function SampleAuditCard({ className }: { className?: string }) {
  return (
    <article
      className={`rounded-lg border border-white/10 bg-ink-900/70 p-5 shadow-card ${className ?? ""}`}
      aria-hidden
    >
      {/* Eyebrow — calls out that this is decorative, not the
          visitor's score. */}
      <p className="mono-data text-[10px] uppercase tracking-[0.22em] text-cyan">
        Sample audit
      </p>

      {/* Score block — amber mono, dominant. */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="mono-data text-[48px] font-bold leading-none text-accent-glow">
          73
        </span>
        <span className="mono-data text-base text-white/40">/ 100</span>
      </div>
      <p className="mono-data mt-2 text-[11px] uppercase tracking-[0.18em] text-accent-glow">
        Needs work
      </p>

      {/* Mini bars — 4 dimensions, decorative. */}
      <ul className="mt-5 space-y-3">
        {SAMPLE_DIMENSIONS.map((d) => (
          <li key={d.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.12em] text-white/65">
                {d.name}
              </span>
              <span className="mono-data text-[11px] text-white/85">
                {d.value}
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full bg-accent"
                style={{ width: `${d.value}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* Footer — plain, human note (no telemetry code). */}
      <footer className="mt-5 border-t border-white/5 pt-3">
        <p className="text-[11px] text-white/40">
          Sample audit · reviewed before delivery
        </p>
      </footer>
    </article>
  );
}
