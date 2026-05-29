"use client";

import { useEffect, useState } from "react";

/**
 * OperatorInsightsPanel — compact, text-only intelligence cards
 * for the calibration cockpit. Polls every 60s.
 *
 * LANGUAGE RULE — DETERMINISTIC EVIDENCE ONLY.
 * Every body string is a printf-style template populated from the
 * /api/admin/calibration/insights response. No LLM, no
 * "may benefit from" / "consider" / "suggest" / "could improve"
 * tone. If a finding is null, the card shows
 * "Insufficient data ({reason})." — no fallback prose.
 */

const POLL_INTERVAL_MS = 60_000;

type CategoryWeakness = {
  category: string;
  industriesAffected: number;
  totalIndustriesWithData: number;
  avgScoreAcrossAffected: number;
};

type CohortWeakness = {
  industry: string;
  band: string;
  pct: number;
  cohortSize: number;
  asOf: string;
};

type UnstableCategory = {
  category: string;
  observationCount: number;
  meanAbsDelta: number;
  stdevDelta: number;
};

type DriftExtreme = {
  auditId: string;
  delta: number;
  createdAt: string;
  previousBand: string | null;
  currentBand: string | null;
};

type CohortCoverage = {
  totalIndustriesWithData: number;
  industriesWithCustomerCohort: number;
  qualifyingIndustries: string[];
  threshold: number;
};

type InsightsResponse = {
  weakestCategoryFinding: CategoryWeakness | null;
  cohortWeakness: CohortWeakness | null;
  mostUnstableCategory: UnstableCategory | null;
  largestPositiveDrift: DriftExtreme | null;
  largestNegativeDrift: DriftExtreme | null;
  cohortCoverage: CohortCoverage | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  overallScore: "Overall",
  semanticClarityScore: "Semantic Clarity",
  crawlerAccessibilityScore: "Crawler Accessibility",
  trustSignalScore: "Trust Signals",
  structuredIdentityScore: "Structured Identity",
  recommendationReadinessScore: "Recommendation Readiness",
  schema: "Schema",
  crawler: "Crawlability",
  trust: "Trust Signals",
  content: "Content",
  brand: "Brand",
  tech: "Tech",
};

const labelOf = (cat: string): string => CATEGORY_LABEL[cat] ?? cat;
const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 12)}…` : id);
const shortDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toISOString().slice(0, 10);
};

// ─── deterministic template functions (one per card) ─────────────

function weakestCategoryBody(w: CategoryWeakness): string {
  return `${labelOf(w.category)} is the weakest category in ${w.industriesAffected} of ${w.totalIndustriesWithData} industries (avg ${w.avgScoreAcrossAffected.toFixed(1)}/100).`;
}

function cohortWeaknessBody(c: CohortWeakness): string {
  return `${c.pct}% of ${c.industry} audits scored below 50 (n=${c.cohortSize}, as of ${shortDate(c.asOf)}).`;
}

function unstableCategoryBody(u: UnstableCategory): string {
  return `${labelOf(u.category)} has the highest replay variance this week (σ=${u.stdevDelta.toFixed(2)}, mean|delta|=${u.meanAbsDelta.toFixed(2)}, n=${u.observationCount}).`;
}

function cohortCoverageBody(c: CohortCoverage): string {
  if (c.totalIndustriesWithData === 0) {
    return "No industries with audit data yet.";
  }
  if (c.industriesWithCustomerCohort === 0) {
    return `0 of ${c.totalIndustriesWithData} industries have ≥${c.threshold} audits — customer percentile claims showing "Benchmark data still calibrating".`;
  }
  return `${c.industriesWithCustomerCohort} of ${c.totalIndustriesWithData} industries have ≥${c.threshold} audits — customer percentile claims active for: ${c.qualifyingIndustries.join(", ")}.`;
}

function driftExtremeBody(d: DriftExtreme, sign: "positive" | "negative"): string {
  const direction = sign === "positive" ? "Largest positive drift" : "Largest negative drift";
  const deltaStr = d.delta > 0 ? `+${d.delta}` : String(d.delta);
  return `${direction} since ${shortDate(d.createdAt)}: ${deltaStr} on audit ${shortId(d.auditId)}.`;
}

// ─── component ───────────────────────────────────────────────────

export function OperatorInsightsPanel({ adminKey }: { adminKey: string }) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/admin/calibration/insights?key=${encodeURIComponent(adminKey)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setError(`API ${res.status} ${res.statusText}`);
          return;
        }
        const body = (await res.json()) as InsightsResponse;
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [adminKey]);

  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
      <p className="section-eyebrow">Operator insights</p>
      <p className="mt-1 text-xs text-white/45">
        Deterministic findings from stored telemetry. Polls every 60s.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-severity-critical">Error: {error}</p>
      ) : null}

      {loading && !data ? (
        <p className="mt-3 text-sm text-white/45">Loading…</p>
      ) : data ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card
            eyebrow="Cross-industry weakness"
            body={
              data.weakestCategoryFinding
                ? weakestCategoryBody(data.weakestCategoryFinding)
                : "Insufficient data (no industries with multi-category breakdown yet)."
            }
            meta="Source: getCategoryWeaknessFrequency"
          />
          <Card
            eyebrow="Cohort underperformance"
            body={
              data.cohortWeakness
                ? cohortWeaknessBody(data.cohortWeakness)
                : "Insufficient data (no industry has ≥5 audits)."
            }
            meta="Source: getScoreDistribution per industry"
          />
          <Card
            eyebrow="Most unstable category (7d)"
            body={
              data.mostUnstableCategory
                ? unstableCategoryBody(data.mostUnstableCategory)
                : "Insufficient data (no category has ≥5 replay observations in 7d)."
            }
            meta="Source: getMostUnstableCategory"
          />
          <Card
            eyebrow="Drift extremes"
            body={[
              data.largestPositiveDrift
                ? driftExtremeBody(data.largestPositiveDrift, "positive")
                : null,
              data.largestNegativeDrift
                ? driftExtremeBody(data.largestNegativeDrift, "negative")
                : null,
            ]
              .filter((s): s is string => s !== null)
              .join(" ") || "Insufficient data (no signed-delta replays yet)."}
            meta="Source: CalibrationReplay"
          />
          <Card
            eyebrow="Cohort coverage"
            body={
              data.cohortCoverage
                ? cohortCoverageBody(data.cohortCoverage)
                : "Insufficient data (no industries with audit data yet)."
            }
            meta="Source: AuditIntelligence groupBy industry"
          />
        </div>
      ) : null}
    </div>
  );
}

function Card({
  eyebrow,
  body,
  meta,
}: {
  eyebrow: string;
  body: string;
  meta: string;
}) {
  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {eyebrow}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-white/85">{body}</p>
      <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/30">
        {meta}
      </p>
    </div>
  );
}
