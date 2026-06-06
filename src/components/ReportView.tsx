import Link from "next/link";
import type {
  ActionItem,
  ActionTag,
  CoreProblem,
  ScoreCap,
  ScoringWeight,
  TopFixPreview,
  VisibilityReport,
} from "@/lib/reporting/types";

export function ReportView({ report }: { report: VisibilityReport }) {
  const tone = scoreTone(report.overallScore);

  return (
    <div className="space-y-12">
      {/* LOCKED above-the-fold: exactly 3 lines.
          Line 1: <score>/100 — <Status>
          Line 2: primaryDriver
          Line 3: costOfInaction
          Nothing else renders here. */}
      <section className="card">
        <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
          <ScoreDial score={report.overallScore} tone={tone} status={report.status} />
          <div>
            <p className="text-3xl font-bold text-white leading-none tracking-tight">
              {report.overallScore}/100 — {report.status}
            </p>
            <p className="mt-5 text-base font-medium text-white leading-snug">
              {report.primaryDriver}
            </p>
            {report.costOfInaction ? (
              <p className="mt-3 text-base font-semibold leading-snug text-accent">
                {report.costOfInaction}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Score cap callout — relocated below the locked score card */}
      {report.scoreCap ? <ScoreCapCallout cap={report.scoreCap} /> : null}

      {/* What this means in real terms */}
      {report.realWorldImpact.length > 0 ? (
        <section>
          <p className="section-eyebrow">What this means in real terms</p>
          <h3 className="h3 mt-2">In plain language.</h3>
          <ul className="mt-6 space-y-2">
            {report.realWorldImpact.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="text-sm text-white/85 leading-relaxed">
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Top 3 reasons */}
      {report.top3Reasons.length > 0 ? (
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
          <p className="section-eyebrow">
            {report.overallScore < 70
              ? "Your score is low primarily because"
              : "What’s holding your score back"}
          </p>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-white/85">
            {report.top3Reasons.map((reason, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 font-semibold text-accent">
                  {i + 1}.
                </span>
                <span>{reason}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Core problems — diagnoses with nested supporting issues */}
      {report.coreProblems.length > 0 ? (
        <section>
          <p className="section-eyebrow">Core problems</p>
          <h3 className="h3 mt-2">
            {report.coreProblems.length === 1
              ? "One pattern is keeping AI from recommending you."
              : `${report.coreProblems.length} patterns are keeping AI from recommending you.`}
          </h3>
          <div className="mt-6 space-y-5">
            {report.coreProblems.map((p, i) => (
              <ProblemCard
                key={p.id}
                problem={p}
                index={i + 1}
                isPrimary={i === 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Top fix preview — placed after core problems, before action plan */}
      {report.topFixPreview ? (
        <section>
          <p className="section-eyebrow">If you fix this</p>
          <h3 className="h3 mt-2">Your most leveraged single fix.</h3>
          <div className="mt-6">
            <TopFixCallout preview={report.topFixPreview} />
          </div>
        </section>
      ) : null}

      {/* Action plan */}
      {report.actionPlan.length > 0 ? (
        <section>
          <p className="section-eyebrow">Action plan</p>
          <h3 className="h3 mt-2">Fix in this order.</h3>
          <ol className="mt-6 space-y-3">
            {report.actionPlan.map((item) => (
              <ActionRow key={item.rank} item={item} />
            ))}
          </ol>
        </section>
      ) : null}

      {/* How your score is calculated — methodology, footer position */}
      <ScoringWeightsBlock weights={report.scoringWeights} />

      {/* Pre-offer line — removes hesitation, sets up purchase */}
      <p className="text-center text-base font-medium text-white/90">
        {report.preOfferLine}
      </p>

      {/* Upsell */}
      <section className="rounded-lg border border-accent/30 bg-gradient-to-br from-accent/[0.10] via-ink-900/60 to-ink-900/60 p-8">
        <p className="section-eyebrow">Done-for-you</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">
          {report.upsellSection.title}
        </h3>
        <p className="muted mt-3 max-w-2xl text-sm leading-relaxed">
          {report.upsellSection.copy}
        </p>
        <p className="mt-5 text-lg font-semibold text-accent">
          {report.upsellSection.offer}
        </p>
        <ul className="mt-5 grid gap-2 text-sm text-white/80 sm:grid-cols-2">
          {report.upsellSection.includes.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Link href="/order" className="btn-primary">
            Have GeoViz fix this for me
          </Link>
        </div>
      </section>
    </div>
  );
}

function ProblemCard({
  problem,
  index,
  isPrimary = false,
}: {
  problem: CoreProblem;
  index: number;
  isPrimary?: boolean;
}) {
  const articleClasses = isPrimary
    ? "rounded-lg border-2 border-accent/50 bg-accent/[0.04] p-6 shadow-card"
    : "card";
  const numberClasses = isPrimary
    ? "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-ink-950"
    : "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-sm font-semibold text-accent";
  return (
    <article className={articleClasses}>
      {isPrimary ? (
        <div className="-mx-6 -mt-6 mb-5 rounded-t-xl bg-accent px-6 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink-950">
            This is the main reason your score is low
          </p>
        </div>
      ) : null}
      <div className="flex items-start gap-4">
        <span className={numberClasses}>
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex-1">
          <span className="inline-flex rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
            {problem.category}
          </span>
          <h4 className="mt-2 text-lg font-semibold text-white leading-snug">
            {problem.title}
          </h4>

          {problem.supportingIssues.length > 0 ? (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                What we found
              </p>
              <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-4">
                {problem.supportingIssues.map((s) => (
                  <li key={s.id} className="text-sm leading-relaxed">
                    <span className="font-medium text-white">{s.title}</span>
                    <span className="text-white/55"> — {s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 rounded-md border-l-2 border-accent bg-accent/[0.04] py-2 pl-3 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
              Business impact
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/85">
              <span aria-hidden className="text-accent/70">
                →{" "}
              </span>
              {problem.businessImpact}
            </p>
          </div>

          <div className="mt-3 rounded-md border-l-2 border-emerald-300/60 bg-emerald-300/[0.04] py-2 pl-3 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              What to fix first
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/85">
              {problem.fixFirst}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  return (
    <li className="card">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-xs font-semibold text-white/70">
            {String(item.rank).padStart(2, "0")}
          </span>
          <div>
            <h4 className="text-base font-semibold text-white leading-snug">
              {item.title}
            </h4>
            <p className="mt-1.5 text-sm leading-relaxed text-white/65">
              {item.body}
            </p>
          </div>
        </div>
        <ActionTagPill tag={item.tag} />
      </div>
    </li>
  );
}

function ActionTagPill({ tag }: { tag: ActionTag }) {
  const style: Record<ActionTag, string> = {
    "Quick win":
      "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    Foundation: "border-accent/30 bg-accent/10 text-accent",
    Authority: "border-sky-300/30 bg-sky-300/10 text-sky-200",
    Cleanup: "border-white/15 bg-white/[0.04] text-white/70",
  };
  return (
    <span
      className={`shrink-0 self-start rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${style[tag]}`}
    >
      {tag}
    </span>
  );
}

function ScoreDial({
  score,
  tone,
  status,
}: {
  score: number;
  tone: "ok" | "warn" | "bad";
  status: string;
}) {
  const ringColor =
    tone === "ok" ? "#34d399" : tone === "warn" ? "#f59e0b" : "#ff6a1a";
  const numberColor =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : "text-accent";
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      className="relative grid h-40 w-40 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${ringColor} ${pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
      }}
    >
      <div className="grid h-32 w-32 place-items-center rounded-full bg-ink-900">
        <div className="text-center">
          <div className={`text-3xl font-bold ${numberColor}`}>{score}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            / 100
          </div>
          <div className="mt-1 text-xs font-semibold text-white/80">{status}</div>
        </div>
      </div>
    </div>
  );
}

function scoreTone(score: number): "ok" | "warn" | "bad" {
  if (score >= 75) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}

function ScoreCapCallout({ cap }: { cap: ScoreCap }) {
  return (
    <div className="mt-6 rounded-lg border border-accent/40 bg-accent/[0.08] p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M8 1v5M8 9.5h.01M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" />
          </svg>
        </span>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent">
            Score cap applied
          </p>
          <p className="mt-1 text-sm font-semibold text-white leading-snug">
            Your score is currently capped at {cap.capValue} because {cap.reason}.
          </p>
          <p className="mt-2 text-sm text-white/75 leading-relaxed">
            Fixing this can increase your score by up to{" "}
            <span className="font-semibold text-accent">
              +{cap.recoveryPotential} points
            </span>
            .
          </p>
          <p className="muted mt-2 text-xs leading-relaxed">
            <span className="font-semibold text-white/85">Recommended fix:</span>{" "}
            {cap.recommendedFix}
          </p>
        </div>
      </div>
    </div>
  );
}

function TopFixCallout({ preview }: { preview: TopFixPreview }) {
  return (
    <div className="rounded-lg border border-emerald-300/40 bg-emerald-300/[0.08] p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
        Top fix
      </p>
      <p className="mt-2 text-base font-semibold text-white leading-snug">
        {preview.issue}
      </p>
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-emerald-300/15 pt-4">
        <p className="text-sm text-white/85 leading-relaxed">
          If you fix this, your estimated score becomes:
        </p>
        <div className="text-right shrink-0">
          <div className="text-4xl font-bold text-emerald-300 leading-none">
            {preview.projectedScore}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
            +{preview.projectedDelta} pts
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoringWeightsBlock({ weights }: { weights: ScoringWeight[] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
      <p className="section-eyebrow">Methodology</p>
      <h3 className="h3 mt-2">How your score is calculated.</h3>
      <p className="muted mt-2 text-sm">
        Six categories, weighted by how much each one moves the needle for AI
        recommendations.
      </p>
      <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
        {weights.map((w) => (
          <li
            key={w.category}
            className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-ink-900/40 px-3 py-2"
          >
            <span className="text-white/80">{w.label}</span>
            <span className="text-xs font-semibold text-accent">
              {w.percent}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
