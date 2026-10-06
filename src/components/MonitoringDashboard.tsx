import type { MonitoringStatusView } from "@/lib/monitoring/status-view";
import type { CitationIntel } from "@/lib/monitoring/tracking/citation-intel";
import type { CycleComparison, CycleMetrics, MetricDelta } from "@/lib/monitoring/tracking/metrics";
import { CATEGORY_LABELS, type Recommendation } from "@/lib/monitoring/tracking/recommendations";

/**
 * Tabbed monitoring dashboard sections (server components, no client JS).
 * Plain-language labels for local-business owners. Every rate shows its
 * denominator; anything unmeasured reads "Not measured yet", never 0.
 */

export const MONITORING_TABS = [
  { key: "overview", label: "Overview" },
  { key: "history", label: "Score History" },
  { key: "prompts", label: "Tracked Questions" },
  { key: "competitors", label: "Competitors" },
  { key: "citations", label: "Citations" },
  { key: "website", label: "Website Changes" },
  { key: "reports", label: "Reports" },
  { key: "actions", label: "Recommended Actions" },
  { key: "improvements", label: "Improvements" },
  { key: "settings", label: "Settings" },
] as const;
/** Proof Engine v1 tab — shown only when GEO_MODULE_PROOF_ENGINE_ENABLED is on. */
export const PROOF_TAB = { key: "proof", label: "Proof" } as const;
export type MonitoringTabKey = (typeof MONITORING_TABS)[number]["key"] | typeof PROOF_TAB.key;

export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI (GPT-4.1 mini)",
  claude: "Anthropic (Claude Haiku 4.5)",
  gemini: "Google (Gemini 2.5 Flash)",
  perplexity: "Perplexity (Sonar)",
};

const pct = (r: number | null | undefined) => (r === null || r === undefined ? "Not measured yet" : `${Math.round(r * 100)}%`);
const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";

function Change({ d, asPoints }: { d: MetricDelta | null | undefined; asPoints?: boolean }) {
  if (!d || d.change === null) return <span className="text-white/40">—</span>;
  const v = asPoints ? d.change : Math.round(d.change * 100);
  const sign = v > 0 ? "+" : "";
  const tone = v > 0 ? "text-severity-info" : v < 0 ? "text-severity-warning" : "text-white/60";
  return <span className={tone}>{`${sign}${v}${asPoints ? "" : " pts"}`}</span>;
}

export function MonitoringTabs({ subscriptionId, active, showProof = false }: { subscriptionId: string; active: MonitoringTabKey; showProof?: boolean }) {
  const tabs: ReadonlyArray<{ key: MonitoringTabKey; label: string }> = showProof ? [...MONITORING_TABS, PROOF_TAB] : MONITORING_TABS;
  return (
    <nav className="mt-10 flex flex-wrap gap-1 border-b border-white/10" aria-label="Monitoring sections">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={`/monitoring/account/${subscriptionId}?tab=${t.key}`}
          className={`px-3 py-2 text-sm ${active === t.key ? "border-b-2 border-accent text-white" : "text-white/55 hover:text-white"}`}
          aria-current={active === t.key ? "page" : undefined}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mono-data mt-2 text-xl text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-white/50">{sub}</p> : null}
    </div>
  );
}

export function CoverageNote({ metrics, samplesPerPrompt }: { metrics: CycleMetrics | null; samplesPerPrompt: number | null }) {
  if (!metrics) return null;
  return (
    <p className="text-xs text-white/55">
      Based on {metrics.answers} AI answers{samplesPerPrompt ? ` (${samplesPerPrompt} per question per AI system)` : ""} ·{" "}
      {metrics.measured} measured ({pct(metrics.coverage)} coverage)
      {metrics.unknownOutcomes > 0 ? ` · ${metrics.unknownOutcomes} under review` : ""}. Percentages use measured answers only.
    </p>
  );
}

function ComparisonNote({ comparison }: { comparison: CycleComparison | null }) {
  if (!comparison) return null;
  if (!comparison.comparable) {
    return <p className="text-xs text-severity-warning">Change vs. last run: not comparable — {comparison.reason?.replace(/^Not comparable: /, "")}</p>;
  }
  return (
    <p className="text-xs text-white/50">
      Changes compare {comparison.comparablePairs} question/AI-system pair{comparison.comparablePairs === 1 ? "" : "s"} measured the same way in both runs
      {comparison.incompatiblePairs.length > 0 ? ` (${comparison.incompatiblePairs.length} not comparable: ${comparison.incompatiblePairs[0]!.reason})` : ""}.
    </p>
  );
}

export function OverviewSection({
  view,
  metrics,
  comparison,
  samplesPerPrompt,
}: {
  view: MonitoringStatusView;
  metrics: CycleMetrics | null;
  comparison: CycleComparison | null;
  samplesPerPrompt: number | null;
}) {
  const latestReport = view.audits.find((a) => a.state === "report_ready");
  return (
    <div className="mt-8 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">GeoViz audit score</p>
      <div className="grid gap-4 md:grid-cols-4">
        <Tile label="GeoViz score" value={view.latestScore ?? "—"} sub={`Previous: ${view.previousScore ?? "—"}`} />
        <Tile
          label="Score change"
          value={view.scoreChange === null ? "—" : view.scoreChange > 0 ? `+${view.scoreChange}` : view.scoreChange}
          sub="vs. your previous reviewed audit"
        />
        <Tile label="Next monitoring run" value={view.nextAuditAt ? fmtDate(view.nextAuditAt) : "None scheduled"} sub={view.access.label} />
        <Tile
          label="Latest report"
          value={latestReport ? fmtDate(latestReport.createdAt) : "—"}
          sub={latestReport?.reportUrl ? <a className="text-accent underline" href={latestReport.reportUrl}>Open report</a> : "In progress"}
        />
      </div>
      <p className="pt-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">AI answer tracking</p>
      <CoverageNote metrics={metrics} samplesPerPrompt={samplesPerPrompt} />
      <div className="grid gap-4 md:grid-cols-3">
        <Tile
          label="How often AI names you"
          value={pct(metrics?.mentionRate)}
          sub={metrics ? <>{metrics.customerMentions} of {metrics.measured} answers · <Change d={comparison?.mentionRate} /></> : "After your first tracking run"}
        />
        <Tile
          label="How often AI cites your website"
          value={pct(metrics?.citationRate)}
          sub={metrics ? <>across {metrics.measured} answers · <Change d={comparison?.citationRate} /></> : "After your first tracking run"}
        />
        <Tile
          label="Your share of AI mentions"
          value={pct(metrics?.shareOfVoice)}
          sub={metrics && metrics.competitors.length > 0 ? <>vs. your tracked competitors · <Change d={comparison?.shareOfVoice} /></> : "Track competitors to compare"}
        />
      </div>
      <ComparisonNote comparison={comparison} />
      {metrics && metrics.notMeasured > 0 ? (
        <p className="text-xs text-white/45">
          {metrics.notMeasured} answer{metrics.notMeasured === 1 ? "" : "s"} couldn&apos;t be measured this run (an AI provider didn&apos;t respond). They&apos;re left out of every percentage — never counted as a &quot;no&quot;.
        </p>
      ) : null}
    </div>
  );
}

export function ScoreHistorySection({
  view,
  cycleHistory,
}: {
  view: MonitoringStatusView;
  cycleHistory: Array<{ id: string; startedAt: Date; status: string; summary: CycleMetrics | null }>;
}) {
  const scored = view.audits.filter((a) => a.score !== null).slice().reverse();
  const max = 100;
  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2">
      <div>
        <h3 className="h3">GeoViz score over time</h3>
        {scored.length === 0 ? (
          <p className="muted mt-3 text-sm">Your score history starts with your first reviewed audit.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {scored.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-white/55">{fmtDate(a.createdAt)}</span>
                <svg width="200" height="8" aria-hidden className="shrink-0">
                  <rect width="200" height="8" rx="2" className="fill-white/10" />
                  <rect width={Math.round(((a.score ?? 0) / max) * 200)} height="8" rx="2" className="fill-accent" />
                </svg>
                <span className="mono-data text-white">{a.score}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="h3">AI visibility over time</h3>
        {cycleHistory.length === 0 ? (
          <p className="muted mt-3 text-sm">Appears after your first question-tracking run.</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/45">
              <tr><th className="py-1.5">Run</th><th>Named</th><th>Cited</th><th>Share</th></tr>
            </thead>
            <tbody>
              {cycleHistory.map((c) => (
                <tr key={c.id} className="border-t border-white/[0.06]">
                  <td className="py-1.5 text-white/70">{fmtDate(c.startedAt)}</td>
                  <td className="mono-data">{pct(c.summary?.mentionRate)}</td>
                  <td className="mono-data">{pct(c.summary?.citationRate)}</td>
                  <td className="mono-data">{c.summary?.competitors?.length ? pct(c.summary.shareOfVoice) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type PromptRow = {
  id: string;
  text: string;
  source: string;
  results: Array<{ provider: string; status: string; mentioned: boolean | null; position: number | null; positionStatus: string | null; callState: string }>;
};

/** "Named k/n" over measured samples; ranked positions only from clear ordered lists. */
function cellFor(samples: PromptRow["results"]) {
  if (samples.length === 0) return <span className="text-white/35">—</span>;
  const measured = samples.filter((r) => r.status === "measured");
  if (measured.length === 0) {
    const review = samples.some((r) => r.callState === "unknown");
    return <span className="text-white/45">{review ? "Under review" : samples.some((r) => r.callState === "pending" || r.callState === "in_flight") ? "Running" : "Not measured"}</span>;
  }
  const named = measured.filter((r) => r.mentioned === true);
  const ranks = named.filter((r) => r.positionStatus === "ranked" && r.position).map((r) => `#${r.position}`);
  const tone = named.length > 0 ? "text-severity-info" : "text-white/60";
  return (
    <span className={tone}>
      {named.length > 0 ? "Named" : "Not named"} {named.length}/{measured.length}
      {ranks.length > 0 ? <span className="text-white/45"> ({ranks.join(", ")})</span> : null}
      {measured.length < samples.length ? <span className="text-white/35"> · {samples.length - measured.length} not measured</span> : null}
    </span>
  );
}

export function PromptsSection({
  subscriptionId,
  prompts,
  providers,
  suggestions,
  maxActivePrompts,
  canEdit,
}: {
  subscriptionId: string;
  prompts: PromptRow[];
  providers: readonly string[];
  suggestions: string[];
  maxActivePrompts: number;
  canEdit: boolean;
}) {
  return (
    <div className="mt-8 space-y-8">
      <p className="muted text-sm">
        The questions customers ask AI before choosing a business. Each run asks every question to each AI system below
        (through its API, with web search where available) several times and records whether you were named. &quot;#2&quot; appears only
        when an answer gave a clear numbered list. Tracking {prompts.length} of {maxActivePrompts} questions.
      </p>
      {prompts.length === 0 ? (
        <p className="text-sm text-white/60">No questions tracked yet — add a suggestion or your own below.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="py-2 pr-3">Question</th>
                {providers.map((p) => <th key={p} className="py-2 pr-3">{PROVIDER_LABELS[p] ?? p}</th>)}
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id} className="border-t border-white/[0.06] align-top">
                  <td className="py-2 pr-3 text-white">{p.text}</td>
                  {providers.map((prov) => <td key={prov} className="py-2 pr-3">{cellFor(p.results.filter((r) => r.provider === prov))}</td>)}
                  {canEdit ? (
                    <td className="py-2">
                      <form action="/api/monitoring/tracking" method="POST">
                        <input type="hidden" name="subscriptionId" value={subscriptionId} />
                        <input type="hidden" name="action" value="remove_prompt" />
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-xs text-white/50 underline" type="submit">Remove</button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit ? (
        <div className="grid gap-6 md:grid-cols-2">
          <form action="/api/monitoring/tracking" method="POST" className="card space-y-3 p-5">
            <input type="hidden" name="subscriptionId" value={subscriptionId} />
            <input type="hidden" name="action" value="add_prompt" />
            <label htmlFor="text" className="text-sm text-white/70">Add your own question</label>
            <input id="text" name="text" required minLength={10} maxLength={300} placeholder="Who is the best roofer near Toledo?" className="input-field" />
            <button className="btn-ghost" type="submit">Track this question</button>
          </form>
          <div className="card p-5">
            <p className="text-sm text-white/70">Suggested questions</p>
            {suggestions.length === 0 ? (
              <p className="muted mt-2 text-xs">No new suggestions right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {suggestions.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/80">{s}</span>
                    <form action="/api/monitoring/tracking" method="POST">
                      <input type="hidden" name="subscriptionId" value={subscriptionId} />
                      <input type="hidden" name="action" value="add_suggested_prompt" />
                      <input type="hidden" name="text" value={s} />
                      <button className="text-xs text-accent underline" type="submit">Track</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-white/45">Your subscription isn&apos;t active, so tracked questions are read-only.</p>
      )}
    </div>
  );
}

export function CompetitorsSection({
  subscriptionId,
  competitors,
  detected,
  metrics,
  maxCompetitors,
  canEdit,
}: {
  subscriptionId: string;
  competitors: Array<{ id: string; name: string; websiteUrl: string | null; domainConfirmed?: boolean; source: string }>;
  detected: Array<{ name: string; answers: number; providers: string[] }>;
  metrics: CycleMetrics | null;
  maxCompetitors: number;
  canEdit: boolean;
}) {
  const providers = metrics ? Object.keys(metrics.byProvider) : [];
  return (
    <div className="mt-8 space-y-8">
      <p className="muted text-sm">
        Compare how often AI answers name you and up to {maxCompetitors} competitors across your tracked questions. This measures
        presence in AI answers only. Website changes for competitors whose website you&apos;ve confirmed appear in the Website Changes tab.
      </p>
      {metrics ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/45">
              <tr><th className="py-2 pr-3">Business</th><th className="pr-3">Named</th><th className="pr-3">Website cited</th>{providers.map((p) => <th key={p} className="pr-3">{PROVIDER_LABELS[p] ?? p}</th>)}</tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/[0.06]">
                <td className="py-2 pr-3 font-semibold text-white">You</td>
                <td className="mono-data pr-3">{pct(metrics.mentionRate)}</td>
                <td className="mono-data pr-3">{pct(metrics.citationRate)}</td>
                {providers.map((p) => <td key={p} className="mono-data pr-3">{pct(metrics.byProvider[p]?.mentionRate)}</td>)}
              </tr>
              {metrics.competitors.map((c) => (
                <tr key={c.id} className="border-t border-white/[0.06]">
                  <td className="py-2 pr-3 text-white">{c.name}</td>
                  <td className="mono-data pr-3">{pct(c.mentionRate)}</td>
                  <td className="mono-data pr-3">{c.citationRate === null ? "Add website" : pct(c.citationRate)}</td>
                  {providers.map((p) => <td key={p} className="mono-data pr-3">{pct(metrics.byProvider[p]?.competitors.find((x) => x.id === c.id)?.mentionRate)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-white/45">
            Your share of AI mentions: <span className="mono-data">{pct(metrics.shareOfVoice)}</span>
            {metrics.averagePosition !== null ? <> · typical position when named: <span className="mono-data">#{metrics.averagePosition.toFixed(1)}</span></> : null}
          </p>
        </div>
      ) : (
        <p className="text-sm text-white/60">Comparison appears after your first tracking run.</p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm text-white/70">Tracked competitors ({competitors.length}/{maxCompetitors})</p>
          <ul className="mt-3 space-y-2">
            {competitors.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-white">{c.name}{c.websiteUrl ? <span className="ml-2 text-xs text-white/40">{c.websiteUrl}</span> : null}</span>
                {canEdit ? (
                  <form action="/api/monitoring/tracking" method="POST">
                    <input type="hidden" name="subscriptionId" value={subscriptionId} />
                    <input type="hidden" name="action" value="remove_competitor" />
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-white/50 underline" type="submit">Remove</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <form action="/api/monitoring/tracking" method="POST" className="mt-4 space-y-2">
              <input type="hidden" name="subscriptionId" value={subscriptionId} />
              <input type="hidden" name="action" value="add_competitor" />
              <input name="name" required placeholder="Competitor business name" className="input-field" />
              <input name="websiteUrl" placeholder="Their website (optional — needed to track their website changes)" className="input-field" />
              <button className="btn-ghost" type="submit">Add competitor</button>
            </form>
          ) : null}
        </div>
        <div className="card p-5">
          <p className="text-sm text-white/70">Businesses AI named in your answers</p>
          {detected.length === 0 ? (
            <p className="muted mt-2 text-xs">None detected yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detected.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-white/80">{d.name} <span className="text-xs text-white/40">named in {d.answers} answer{d.answers === 1 ? "" : "s"}</span></span>
                  {canEdit ? (
                    <form action="/api/monitoring/tracking" method="POST">
                      <input type="hidden" name="subscriptionId" value={subscriptionId} />
                      <input type="hidden" name="action" value="track_detected_competitor" />
                      <input type="hidden" name="name" value={d.name} />
                      <button className="text-xs text-accent underline" type="submit">Track</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DomainList({ title, rows, empty }: { title: string; rows: CitationIntel["frequentDomains"]; empty: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-white/70">{title}</p>
      {rows.length === 0 ? (
        <p className="muted mt-2 text-xs">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.domain} className="flex justify-between gap-3">
              <span className="text-white/85">{r.domain}{r.isCustomerSite ? " (your site)" : r.competitorSite ? ` (${r.competitorSite})` : ""}</span>
              <span className="mono-data text-white/50">{r.answers}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CitationsSection({ citations }: { citations: CitationIntel | null }) {
  if (!citations) return <p className="muted mt-8 text-sm">Citation tracking appears after your first tracking run.</p>;
  return (
    <div className="mt-8 space-y-4">
      <p className="muted text-sm">
        The websites AI systems pointed to when answering your questions ({citations.answersWithCitations} of {citations.measuredAnswers} answers
        included sources). Your own site was cited {citations.customerSiteCitedCount} time{citations.customerSiteCitedCount === 1 ? "" : "s"}.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <DomainList title="Most-cited sources" rows={citations.frequentDomains} empty="No sources cited yet." />
        <DomainList title="Sources cited when AI named you" rows={citations.supportingCustomer} empty="None yet." />
        <DomainList title="Sources cited when AI named competitors" rows={citations.supportingCompetitors} empty="None yet." />
        <DomainList title="Possible citation gaps" rows={citations.opportunities} empty="No clear gaps found." />
      </div>
      <p className="text-xs text-white/45">
        A &quot;gap&quot; is a source AI cited alongside competitors but never alongside you. Being listed there may help AI confirm your
        business; it doesn&apos;t guarantee you&apos;ll be recommended.
      </p>
    </div>
  );
}

export function ReportsSection({ view }: { view: MonitoringStatusView }) {
  if (view.audits.length === 0) return <p className="muted mt-8 text-sm">Your first monitoring audit is scheduled — it will appear here once it starts.</p>;
  return (
    <ul className="mt-8 divide-y divide-white/[0.06] rounded-lg border border-white/10">
      {view.audits.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-white">{fmtDate(a.createdAt)}{a.isBaseline ? <span className="ml-2 text-xs text-white/45">Starting audit</span> : null}</p>
            <p className="text-xs text-white/50">{a.stateLabel}</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {a.score !== null ? <span className="mono-data text-white">{a.score}/100</span> : null}
            {a.reportUrl ? <a href={a.reportUrl} className="text-accent underline">Open report</a> : null}
            {a.comparisonUrl ? <a href={a.comparisonUrl} className="text-white/70 underline">What changed</a> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ActionsSection({
  recommendations,
  subscriptionId,
  canEdit = false,
  taskByRecommendation = {},
}: {
  recommendations: Recommendation[];
  subscriptionId?: string;
  canEdit?: boolean;
  /** recommendation id → open improvement task id */
  taskByRecommendation?: Record<string, string>;
}) {
  if (recommendations.length === 0) return <p className="muted mt-8 text-sm">Recommendations appear once your first audit is reviewed and your questions have run.</p>;
  return (
    <ol className="mt-8 space-y-3">
      {recommendations.map((r, i) => (
        <li key={r.id} className="card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">
            {i + 1}. {CATEGORY_LABELS[r.category]} · {r.priority === 1 ? "Do first" : r.priority === 2 ? "Next" : "Later"}
          </p>
          <p className="mt-2 font-semibold text-white">{r.title}</p>
          <p className="mt-1 text-sm text-white/75">{r.action}</p>
          <p className="mt-2 text-xs text-white/50">Why: {r.evidence}</p>
          {r.url ? <p className="mono-data mt-1 break-all text-xs text-white/40">Source: {r.url}</p> : null}
          {subscriptionId && taskByRecommendation[r.id] ? (
            <a href={`/monitoring/account/${subscriptionId}?tab=improvements#task-${taskByRecommendation[r.id]}`} className="mt-3 inline-block text-xs text-accent underline">Task created — view it</a>
          ) : subscriptionId && canEdit ? (
            <form action="/api/monitoring/improvements" method="POST" className="mt-3">
              <input type="hidden" name="subscriptionId" value={subscriptionId} />
              <input type="hidden" name="action" value="create_from_recommendation" />
              <input type="hidden" name="recommendationId" value={r.id} />
              <button className="btn-ghost px-3 py-1 text-xs" type="submit">Create improvement task</button>
            </form>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
