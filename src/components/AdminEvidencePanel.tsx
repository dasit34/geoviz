"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * AdminEvidencePanel — Intelligence Engine Phase 1's stats view.
 * Self-contained polling component, mirrors
 * CalibrationLearningLoopPanel.tsx's pattern.
 *
 * Renders a simple disabled state when GEO_EVIDENCE_LAYER_ENABLED
 * isn't "true" — the API route returns `{ enabled: false }` (not an
 * error) in that case.
 */

const POLL_INTERVAL_MS = 60_000;

type MentionRate = {
  totalObservations: number;
  mentionedCount: number;
  rate: number | null;
};

type RecommendationRate = {
  totalObservations: number;
  recommendedCount: number;
  rate: number | null;
};

type ModelOutcome = { provider: string; win: boolean; observedAt: string };
type ModelWinLoss = { outcomes: ModelOutcome[]; wins: number; losses: number };

type ShareOfVoiceEntry = {
  entityName: string;
  entityNormalized: string;
  isSubjectBusiness: boolean;
  mentionCount: number;
  share: number;
};
type ShareOfVoiceResult = {
  totalMentions: number;
  entities: ShareOfVoiceEntry[];
};

type CompetitorFrequencyEntry = {
  competitorNormalized: string;
  competitorName: string;
  mentionCount: number;
};

type EvidenceStatsResponse =
  | { enabled: false }
  | {
      enabled: true;
      businessId: string | null;
      industryNormalized: string | null;
      geographyRaw: string | null;
      windowDays: number | null;
      mentionRate: MentionRate | null;
      recommendationRate: RecommendationRate | null;
      modelWinLoss: ModelWinLoss | null;
      shareOfVoice: ShareOfVoiceResult | null;
      competitorFrequency: CompetitorFrequencyEntry[] | null;
    };

function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(0)}%`;
}

export function AdminEvidencePanel({
  adminKey,
  businessId,
}: {
  adminKey: string;
  businessId: string;
}) {
  const [data, setData] = useState<EvidenceStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ key: adminKey, businessId });
      const res = await fetch(`/api/admin/evidence/stats?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`API ${res.status} ${res.statusText}`);
        return;
      }
      const body = (await res.json()) as EvidenceStatsResponse;
      setData(body);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminKey, businessId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
        <p className="section-eyebrow">Evidence layer</p>
        <p className="mt-3 text-sm text-white/45">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
        <p className="section-eyebrow">Evidence layer</p>
        <p className="mt-3 text-sm text-severity-critical">Error: {error}</p>
      </div>
    );
  }

  if (!data || !data.enabled) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
        <p className="section-eyebrow">Evidence layer</p>
        <p className="mt-2 text-sm text-white/55">
          Disabled (<code>GEO_EVIDENCE_LAYER_ENABLED</code> is not
          &quot;true&quot;). See{" "}
          <code>docs/INTELLIGENCE_ENGINE_GAP_ANALYSIS.md</code> for rollout
          steps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="card">
          <p className="section-eyebrow">Mention rate</p>
          <h3 className="h3 mt-2 font-mono">{pct(data.mentionRate?.rate ?? null)}</h3>
          <p className="mt-1 text-xs text-white/45">
            {data.mentionRate
              ? `${data.mentionRate.mentionedCount} of ${data.mentionRate.totalObservations} competitive-capture observations`
              : "No data"}
          </p>
        </div>
        <div className="card">
          <p className="section-eyebrow">Recommendation rate</p>
          <h3 className="h3 mt-2 font-mono">
            {pct(data.recommendationRate?.rate ?? null)}
          </h3>
          <p className="mt-1 text-xs text-white/45">
            {data.recommendationRate
              ? `${data.recommendationRate.recommendedCount} of ${data.recommendationRate.totalObservations} self-assessment observations`
              : "No data"}
          </p>
        </div>
        <div className="card">
          <p className="section-eyebrow">Model win/loss</p>
          <h3 className="h3 mt-2 font-mono">
            {data.modelWinLoss ? `${data.modelWinLoss.wins}–${data.modelWinLoss.losses}` : "—"}
          </h3>
          <p className="mt-1 text-xs text-white/45">
            {data.modelWinLoss?.outcomes.length
              ? `Latest per provider: ${data.modelWinLoss.outcomes
                  .map((o) => `${o.provider}=${o.win ? "win" : "loss"}`)
                  .join(", ")}`
              : "No data"}
          </p>
        </div>
      </div>

      <div className="card">
        <p className="section-eyebrow">
          Share of voice
          {data.industryNormalized && data.geographyRaw
            ? ` · ${data.industryNormalized} / ${data.geographyRaw}`
            : ""}
        </p>
        {!data.shareOfVoice || data.shareOfVoice.entities.length === 0 ? (
          <p className="mt-3 text-sm text-white/45">No competitive-capture data yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {data.shareOfVoice.entities.map((e) => (
              <li key={e.entityNormalized} className="flex items-baseline justify-between">
                <span className={e.isSubjectBusiness ? "font-semibold text-accent" : "text-white/80"}>
                  {e.entityName}
                  {e.isSubjectBusiness ? " (this business)" : ""}
                </span>
                <span className="font-mono text-white/60">
                  {(e.share * 100).toFixed(0)}% · n={e.mentionCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <p className="section-eyebrow">Strongest competitors</p>
        {!data.competitorFrequency || data.competitorFrequency.length === 0 ? (
          <p className="mt-3 text-sm text-white/45">No competitive-capture data yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {data.competitorFrequency.slice(0, 10).map((c) => (
              <li key={c.competitorNormalized} className="flex items-baseline justify-between">
                <span className="text-white/80">{c.competitorName}</span>
                <span className="font-mono text-white/60">{c.mentionCount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
