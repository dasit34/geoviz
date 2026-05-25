/**
 * SampleReportPreview — the homepage's believable sample report card.
 *
 * Light-surface composition that mirrors the real PDF's score-card
 * + category-bars layout. Sample data only; clearly stamped
 * "SAMPLE — directional" to avoid confusing real audits.
 *
 * Server component.
 */

type Tone = "ok" | "warn" | "bad" | "muted";

type CategoryBar = {
  label: string;
  score: number; // 0..100
  tone: Tone;
};

type FindingChip = "warn" | "bad" | "ok";

type LineItem = {
  chip: FindingChip;
  title: string;
  detail: string;
};

const SAMPLE_OVERALL = 58;
const SAMPLE_BAND = "Needs Work";
const SAMPLE_CONFIDENCE = "Moderate";

const SAMPLE_CATEGORIES: CategoryBar[] = [
  { label: "Interpret", score: 72, tone: "warn" },
  { label: "Retrieve", score: 64, tone: "warn" },
  { label: "Trust", score: 51, tone: "bad" },
  { label: "Cite", score: 28, tone: "bad" },
  { label: "Recommend", score: 47, tone: "bad" },
];

const SAMPLE_FINDINGS: LineItem[] = [
  {
    chip: "bad",
    title: "FAQ schema missing",
    detail: "No FAQPage JSON-LD on service pages — citation gap.",
  },
  {
    chip: "warn",
    title: "Service-page depth thin",
    detail: "Median 320 words; AI answers need 600+ for confidence.",
  },
  {
    chip: "warn",
    title: "Footer NAP inconsistent",
    detail: "Address mismatch between schema and footer block.",
  },
];

const SAMPLE_FIXES: LineItem[] = [
  {
    chip: "ok",
    title: "Add FAQPage schema",
    detail: "Top 5 customer questions, structured as FAQPage JSON-LD.",
  },
  {
    chip: "ok",
    title: "Expand service-page copy",
    detail: "Target 700–900 words per primary service page.",
  },
  {
    chip: "ok",
    title: "Reconcile footer NAP",
    detail: "Match name/address/phone to schema across all pages.",
  },
];

const TONE_FILL: Record<Tone, string> = {
  ok: "bg-severity-info",
  warn: "bg-severity-warning",
  bad: "bg-accent",
  muted: "bg-cream-300",
};

const CHIP_CLASS: Record<FindingChip, string> = {
  bad: "status-chip status-chip-missing",
  warn: "status-chip status-chip-weak",
  ok: "status-chip status-chip-clear",
};

const CHIP_LABEL: Record<FindingChip, string> = {
  bad: "Critical",
  warn: "Watch",
  ok: "Apply",
};

export function SampleReportPreview({ className }: { className?: string }) {
  return (
    <div
      className={[
        "card-light relative overflow-hidden p-6 sm:p-8 lg:p-10",
        className ?? "",
      ].join(" ")}
    >
      {/* SAMPLE stamp — top right */}
      <span
        aria-hidden="true"
        className="absolute right-4 top-4 sm:right-6 sm:top-6 status-chip status-chip-review"
      >
        Sample · directional
      </span>

      {/* Top grid — score left, categories right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12">
        {/* Left — overall score block */}
        <div className="flex flex-col gap-4">
          <span className="eyebrow-light">AI Visibility Score</span>
          <div className="flex items-end gap-4">
            <span
              className="font-mono leading-none tracking-tight text-graphite-900"
              style={{ fontSize: "clamp(80px, 12vw, 112px)", fontWeight: 700, letterSpacing: "-0.03em" }}
            >
              {SAMPLE_OVERALL}
            </span>
            <span className="muted-light font-mono text-base pb-3">/ 100</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip status-chip-weak">{SAMPLE_BAND}</span>
            <span className="status-chip status-chip-review">
              Confidence · {SAMPLE_CONFIDENCE}
            </span>
          </div>
          <p className="lede-light text-[15px] mt-2">
            AI systems can find this business, but recommendation
            confidence is limited. Citation surfaces (FAQ, structured
            answers) and content depth are the gating signals.
          </p>
          <div className="mt-3 pt-3 border-t border-cream-200 grid grid-cols-2 gap-3 text-[12px] font-mono uppercase tracking-[0.16em]">
            <div>
              <div className="muted-light">Audited</div>
              <div className="text-graphite-900">2026-05-23</div>
            </div>
            <div>
              <div className="muted-light">Report ID</div>
              <div className="text-graphite-900">geo-9f3a-sample</div>
            </div>
          </div>
        </div>

        {/* Right — category bars */}
        <div className="flex flex-col gap-4">
          <span className="eyebrow-light">Signal breakdown</span>
          <ul className="flex flex-col gap-3 mt-1">
            {SAMPLE_CATEGORIES.map((c) => (
              <li key={c.label} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-graphite-900 text-sm font-medium">
                    {c.label}
                  </span>
                  <span className="font-mono text-graphite-700 text-sm">
                    {c.score}
                    <span className="muted-light"> / 100</span>
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full bg-cream-200 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={c.score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${c.label} score`}
                >
                  <div
                    className={`h-full rounded-full ${TONE_FILL[c.tone]}`}
                    style={{ width: `${c.score}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom grid — findings + fixes */}
      <div className="mt-10 pt-8 border-t border-cream-200 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          <span className="eyebrow-light">Top findings</span>
          <ul className="flex flex-col gap-3">
            {SAMPLE_FINDINGS.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`${CHIP_CLASS[f.chip]} shrink-0 mt-1`}>
                  {CHIP_LABEL[f.chip]}
                </span>
                <div className="min-w-0">
                  <div className="text-graphite-900 text-sm font-medium">
                    {f.title}
                  </div>
                  <div className="muted-light text-[13px] leading-snug mt-0.5">
                    {f.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-4">
          <span className="eyebrow-light">Priority fixes</span>
          <ul className="flex flex-col gap-3">
            {SAMPLE_FIXES.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`${CHIP_CLASS[f.chip]} shrink-0 mt-1`}>
                  {CHIP_LABEL[f.chip]}
                </span>
                <div className="min-w-0">
                  <div className="text-graphite-900 text-sm font-medium">
                    {f.title}
                  </div>
                  <div className="muted-light text-[13px] leading-snug mt-0.5">
                    {f.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
