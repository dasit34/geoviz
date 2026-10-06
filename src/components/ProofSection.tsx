import { NO_SOURCE_LABEL, type RunEvidence } from "@/lib/monitoring/proof/evidence";
import { ownerSummaryText } from "@/lib/monitoring/proof/owner-summary";
import { INTENT_LABELS } from "@/lib/monitoring/proof/question-set";
import type { ProofDashboard } from "@/lib/monitoring/proof/service";
import type { ProofView } from "@/lib/monitoring/proof/view";

/**
 * Proof Engine v1 — read-only proof view (server component, no client JS).
 * Every rate shows "Not measured" rather than 0, sources are only what the
 * provider returned, and outcomes never claim causation.
 */
const pct = (r: number | null) => (r === null ? "Not measured" : `${Math.round(r * 100)}%`);
const date = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

function Row({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <tr className="border-t border-white/5">
      <td className="py-2 pr-4 text-white/60">{label}</td>
      <td className="mono-data py-2 pr-4 text-white">{before}</td>
      <td className="mono-data py-2 text-white">{after}</td>
    </tr>
  );
}

export function ProofExperimentCard({ v }: { v: ProofView }) {
  return (
    <article className="card p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-white/45">
        Experiment · question set v{v.questionSet.version} · {v.outcome.recorded ? `assessed ${date(v.outcome.assessedAt)}` : "provisional (not yet recorded)"}
      </p>
      <h3 className="mt-1 text-lg font-semibold text-white">{v.action.title}</h3>
      <p className="mt-1 text-sm text-white/70">{v.action.proposedFix}</p>
      <p className="mt-1 text-xs text-white/50">
        Target {v.action.targetUrl ?? "—"} · expected to affect {v.action.expectedCategory} · approved {date(v.dates.approvedAt)} · implemented {date(v.dates.implementedAt)} · verified {date(v.dates.verifiedAt)}
      </p>

      <p className={`mt-4 text-sm font-semibold ${v.outcome.state === "improvement_observed" ? "text-severity-info" : v.outcome.state === "decline_observed" ? "text-severity-critical" : "text-white"}`}>
        {v.outcome.label}
      </p>
      <p className="mt-1 text-sm text-white/70">{v.outcome.summary}</p>

      <p className="mt-3 text-xs text-white/55">
        {v.comparable ? "The two measurements are comparable (same questions, AI systems, sampling and settings)." : `Not comparable: ${v.comparabilityReasons.join("; ") || "no follow-up measurement yet"}.`}
      </p>

      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.14em] text-white/40">
            <th className="py-1 pr-4 font-normal">Measure</th>
            <th className="py-1 pr-4 font-normal">Baseline ({date(v.dates.baselineAt)})</th>
            <th className="py-1 font-normal">Follow-up ({date(v.dates.followUpAt)})</th>
          </tr>
        </thead>
        <tbody>
          <Row label="GeoViz audit score" before={v.score.baseline ? `${v.score.baseline.score}` : "No reviewed audit"} after={v.score.followUp ? `${v.score.followUp.score}` : "No reviewed audit"} />
          <Row label="Named in AI answers" before={pct(v.mentionRate.baseline)} after={pct(v.mentionRate.followUp)} />
          <Row
            label="Competitor share"
            before={v.competitorShare.comparable ? pct(v.competitorShare.baseline) : "Not comparable"}
            after={v.competitorShare.comparable ? pct(v.competitorShare.followUp) : v.competitorShare.reason ?? "Not comparable"}
          />
        </tbody>
      </table>
      <p className="mt-1 text-xs text-white/40">{v.score.note}</p>

      <div className="mt-3 text-xs text-white/60">
        <p>Sources returned by the AI providers (comparable answers):</p>
        <p>Newly returned: {v.citations.gained.join(", ") || "none"} · No longer returned: {v.citations.lost.join(", ") || "none"} · Both: {v.citations.kept.join(", ") || "none"}</p>
      </div>

      <div className="mt-3 text-xs text-white/60">
        <p>Website evidence:</p>
        {v.website.verification ? (
          <p>Independent check: {v.website.verification.outcome?.replace(/_/g, " ") ?? "pending"} on {v.website.verification.url ?? "—"} ({date(v.website.verification.checkedAt)})</p>
        ) : (
          <p>No independent website check yet.</p>
        )}
        {v.website.changes.slice(0, 5).map((c, i) => (
          <p key={i}>
            {c.changeType.replace(/_/g, " ")} · {c.url} ({date(c.detectedAt)}){c.beforeExcerpt || c.afterExcerpt ? ` — before: “${c.beforeExcerpt ?? "—"}” after: “${c.afterExcerpt ?? "—"}”` : ""}
          </p>
        ))}
      </div>

      <p className="mt-4 text-xs text-white/45">{v.noCausationNote}</p>
    </article>
  );
}

export function EvidenceTable({ rows }: { rows: RunEvidence[] }) {
  if (rows.length === 0) return <p className="muted text-sm">No measured answers yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.slice(0, 40).map((e) => (
        <li key={e.resultId} className="card p-4 text-sm">
          <p className="text-xs text-white/45">
            {e.providerLabel} · {e.model ?? "model not reported"} · {date(e.at)} · {e.status === "measured" ? (e.mentioned ? "named the business" : "did not name the business") : `not measured (${e.error?.code ?? e.callState})`}
          </p>
          <p className="mt-1 font-medium text-white">{e.question}</p>
          {e.response ? <p className="mt-1 max-h-32 overflow-hidden whitespace-pre-line text-white/70">{e.response.slice(0, 600)}</p> : null}
          <p className="mt-1 text-xs text-white/50">
            {e.positionNote}
            {e.competitorsMentioned.length ? ` · competitors named: ${e.competitorsMentioned.join(", ")}` : ""}
            {e.sentiment ? ` · ${e.sentiment.label} (quoted: “${e.sentiment.quote.slice(0, 140)}”)` : " · sentiment not stated"}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {e.status !== "measured" ? "Sources: not measured" : e.sources.length ? `Sources returned: ${e.sources.map((s) => s.domain ?? s.url).join(", ")}` : NO_SOURCE_LABEL}
            {e.urlsInAnswer.length ? ` · URLs written in the answer (not provider sources): ${e.urlsInAnswer.length}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-white/35">{e.accessLabel}</p>
        </li>
      ))}
    </ul>
  );
}

export function ProofSection({ d }: { d: ProofDashboard }) {
  return (
    <section className="mt-8 space-y-8">
      <div>
        <h2 className="h3">Fixed question set</h2>
        {d.activeSet ? (
          <>
            <p className="muted mt-1 text-sm">
              Version {d.activeSet.version} · active since {date(d.activeSet.activatedAt)} · {d.activeSet.businessCategory ?? "category not set"}
              {d.activeSet.city || d.activeSet.serviceArea ? ` · ${[d.activeSet.city, d.activeSet.state, d.activeSet.serviceArea].filter(Boolean).join(", ")}` : ""}
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-white/80">
              {d.activeSet.items.map((i) => (
                <li key={i.id}>
                  {i.text} <span className="text-xs text-white/40">— {INTENT_LABELS[i.intent].split(" — ")[0]}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="muted mt-1 text-sm">No fixed question set is active yet.</p>
        )}
      </div>

      <div>
        <h2 className="h3">Before and after</h2>
        <div className="mt-3 space-y-4">
          {d.experiments.length ? d.experiments.map((v) => <ProofExperimentCard key={v.experimentId} v={v} />) : <p className="muted text-sm">No improvement experiments yet.</p>}
        </div>
      </div>

      <div>
        <h2 className="h3">Monthly summary</h2>
        <pre className="card mt-3 whitespace-pre-wrap p-4 font-sans text-sm text-white/75">{ownerSummaryText(d.summary)}</pre>
      </div>

      <div>
        <h2 className="h3">Latest measured answers</h2>
        <div className="mt-3">
          <EvidenceTable rows={d.latestEvidence} />
        </div>
      </div>
    </section>
  );
}
