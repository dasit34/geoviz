/**
 * ScoringExamplePanel — the "live visibility diagnostic snapshot"
 * card. The analytical surface on the homepage report-row: composite
 * score + band + the kind of evidence findings an audit surfaces,
 * plus a few dimension bars. ALL values are SAMPLE_ consts; the card
 * carries the "Live visibility diagnostic snapshot" eyebrow + sample
 * business identity (North Coast Roofing). Uses the `severity` status
 * tokens for the finding markers; no scoring logic lives here. This
 * card owns the score; its right-side counterpart (PrintedCoverSample)
 * communicates the deliverable instead.
 */

type Tone = "ok" | "warn" | "bad";

const SAMPLE_SCORE = 61;
const SAMPLE_BAND = "Needs Work"; // 46–65 band (frozen v1 thresholds)

const SAMPLE_FINDINGS: { tone: Tone; text: string }[] = [
  { tone: "ok", text: "Business name, phone, and address are consistent across the site" },
  { tone: "ok", text: "Crawlable by AI systems — nothing blocking in robots.txt" },
  { tone: "warn", text: "Service pages are thin — little for AI to quote when recommending you" },
  { tone: "bad", text: "No structured data — AI can't reliably identify the business entity" },
  { tone: "bad", text: "No FAQ or answer content AI can retrieve for customer questions" },
];

const SAMPLE_DIMENSIONS = [
  { label: "Schema / structured data", value: 28 },
  { label: "AI crawler readiness", value: 71 },
  { label: "Trust signals", value: 64 },
  { label: "Content depth", value: 41 },
];

function Mark({ tone }: { tone: Tone }) {
  const color =
    tone === "ok"
      ? "text-severity-info"
      : tone === "warn"
        ? "text-severity-warning"
        : "text-severity-critical";
  return (
    <span
      aria-hidden
      className={`mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center ${color}`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {tone === "ok" && <path d="m3 8.5 3.5 3.5L13 4.5" />}
        {tone === "warn" && (
          <>
            <path d="M8 4v5" />
            <path d="M8 12h.01" />
          </>
        )}
        {tone === "bad" && (
          <>
            <path d="M4 4l8 8" />
            <path d="M12 4l-8 8" />
          </>
        )}
      </svg>
    </span>
  );
}

export function ScoringExamplePanel({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-white/10 bg-ink-900/60 shadow-card ${className}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Live visibility diagnostic snapshot
          </p>
          <p className="mt-2 text-base font-semibold text-white/85">
            North Coast Roofing
          </p>
          <p className="mt-0.5 text-sm text-white/45">
            northcoastroofing.com
          </p>
        </div>
        <div className="text-right">
          <p className="mono-data text-4xl font-bold text-white">
            {SAMPLE_SCORE}
            <span className="ml-1 text-lg font-medium text-white/35">
              / 100
            </span>
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            {SAMPLE_BAND}
          </p>
        </div>
      </div>

      {/* Phase L sample pills — hardcoded values consistent with
          SAMPLE_SCORE=61 + "Needs Work" band. Mirror the live
          report's <ReportScoreCard /> context strip so the
          homepage sample shows what real audits will render. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-white/[0.06] px-6 py-3 text-[11px] text-white/55">
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5">
          Top 38% among roofing audits (n=42)
        </span>
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5">
          Moderate confidence
          <span aria-hidden className="mx-1 text-white/30">·</span>
          <span className="text-white/45">schema markup partially detected</span>
        </span>
      </div>
      <p className="px-6 pt-2 text-[11px] text-white/45">
        <span className="font-semibold text-white/65">Watch:</span>{" "}
        Recommendation Readiness trails 62% of roofing peers (n=42).
      </p>

      <ul className="space-y-3.5 px-6 py-6 text-sm">
        {SAMPLE_FINDINGS.map((f) => (
          <li key={f.text} className="flex gap-3">
            <Mark tone={f.tone} />
            <span className="leading-relaxed text-white/75">{f.text}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-t border-white/[0.06] px-6 py-6">
        {SAMPLE_DIMENSIONS.map((d) => (
          <div key={d.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-white/50">{d.label}</span>
              <span className="mono-data text-xs text-white/45">{d.value}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-white/30"
                style={{ width: `${d.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
