import Link from "next/link";
import { ScoreGauge } from "./ScoreGauge";
import type { CheckResult, CheckStatus } from "@/lib/free-check/types";

type ApiResult = {
  overallScore: number;
  checks: CheckResult[];
  strengths: string[];
  problems: string[];
  fixes: string[];
};

function bandLabel(score: number): string {
  if (score >= 80) return "Strong AI Visibility";
  if (score >= 60) return "Developing";
  if (score >= 40) return "Needs Work";
  return "At Risk";
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  strong: "Strong",
  needs_improvement: "Needs Improvement",
  missing: "Missing",
};

const STATUS_DOT: Record<CheckStatus, string> = {
  strong: "severity-dot--info",
  needs_improvement: "severity-dot--warning",
  missing: "severity-dot--critical",
};

export function FreeCheckResults({
  result,
  input,
}: {
  result: ApiResult;
  input: { websiteUrl: string; businessName: string; email: string };
}) {
  const orderParams = new URLSearchParams({
    websiteUrl: input.websiteUrl,
    email: input.email,
  });

  return (
    <div className="space-y-10">
      <div className="card flex flex-col items-center gap-4 py-10 text-center">
        <p className="pill">Your Free AI Visibility Snapshot</p>
        <ScoreGauge
          score={result.overallScore}
          status={bandLabel(result.overallScore)}
          size="lg"
          sampleLabel={false}
        />
        <p className="max-w-md text-xs leading-relaxed text-white/45">
          This preview estimates how clearly AI systems may understand and
          recommend your business based on publicly available website
          signals. It is not a guarantee of placement or recommendation.
        </p>
      </div>

      <div className="card">
        <h2 className="h3">What we checked</h2>
        <div className="mt-5 divide-y divide-white/5">
          {result.checks.map((c) => (
            <div key={c.id} className="flex items-start gap-3 py-4">
              <span
                className={`severity-dot ${STATUS_DOT[c.status]}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white/90">
                    {c.label}
                  </p>
                  <span className="pill text-[10px]">
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/55">{c.explanation}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="card">
          <h3 className="h3 text-base">Top strengths</h3>
          {result.strengths.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {result.strengths.map((s) => (
                <ListRow key={s} tone="good" label={s} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-white/45">
              No strong signals detected yet — see the fixes below.
            </p>
          )}
        </div>
        <div className="card">
          <h3 className="h3 text-base">Top problems</h3>
          {result.problems.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {result.problems.map((p) => (
                <ListRow key={p} tone="bad" label={p} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-white/45">
              No major problems detected in this preview.
            </p>
          )}
        </div>
      </div>

      {result.fixes.length > 0 ? (
        <div className="card">
          <h3 className="h3 text-base">Recommended fixes</h3>
          <ol className="mt-4 space-y-3">
            {result.fixes.map((f, i) => (
              <li key={f} className="flex items-start gap-3 text-sm text-white/75">
                <span className="mono-data mt-0.5 text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="card border-accent/30 bg-gradient-to-b from-accent/[0.06] to-transparent text-center">
        <p className="pill border-accent/30 bg-accent/10 text-accent">
          This is only the surface-level check
        </p>
        <h2 className="h2 mt-4">
          See the full picture of your AI visibility.
        </h2>
        <p className="muted mx-auto mt-4 max-w-xl text-sm leading-relaxed">
          The full GeoViz audit analyzes how AI systems understand, trust,
          retrieve, cite, and recommend your business. Get the complete
          report with prioritized fixes and detailed recommendations.
        </p>
        <Link
          href={`/order?${orderParams.toString()}`}
          className="btn-primary mt-6 inline-flex justify-center text-base"
          onClick={() => {
            console.log("[free-check] full audit cta clicked");
          }}
        >
          Get the Full GeoViz Audit — $97
        </Link>
      </div>
    </div>
  );
}

function ListRow({ tone, label }: { tone: "good" | "bad"; label: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-white/75">
      <span
        className={`severity-dot ${tone === "good" ? "severity-dot--info" : "severity-dot--critical"}`}
        aria-hidden
      />
      <span>{label}</span>
    </li>
  );
}
