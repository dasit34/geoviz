/**
 * Strength card — green checkmark + short concise label. Used in the
 * "Top Strengths" section of the report. Pure presentation; the label
 * is supplied by `deriveStrengths` in `lib/parse-report.ts`, which
 * only emits a strength when a rubric category scored ≥ 70% of max.
 * Never invents.
 */
export function StrengthCard({ label }: { label: string }) {
  return (
    <div className="strength-card">
      <span className="strength-card-icon" aria-hidden>
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8 L7 12 L13 4" />
        </svg>
      </span>
      <span className="strength-card-label">{label}</span>
    </div>
  );
}
