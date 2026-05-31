import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isAuthed, getAdminPassword } from "@/lib/admin-auth";
import { loginAction } from "@/app/admin/actions";
import {
  ProviderTelemetryGrid,
  parseAiValidations,
  parseConsensusIndex,
  type ParsedValidations,
  type ParsedConsensus,
} from "@/components/admin/ProviderTelemetryGrid";
import { CopyJsonButton } from "@/components/admin/CopyJsonButton";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Audit trace · Admin · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Internal-only audit trace mode.
 *
 * Customer-facing surfaces never include this view. The route is gated
 * by the same ADMIN_PASSWORD cookie used by `/admin` so a leaked
 * trace URL still requires the operator session.
 *
 * Renders, in this order, every signal already persisted on the
 * `AuditIntelligence` row for the audit:
 *
 *   1. Per-provider validator panel (status / latency-if-available /
 *      timestamp / reason). When `aiValidations` is null this shows
 *      "Not run" — we never fabricate provider participation.
 *   2. Consensus index summary (verdict / confidence / agreement /
 *      confidence_index / dimension scores).
 *   3. Deterministic score breakdown (category scores, weights,
 *      bonuses, penalties, synergy).
 *   4. Score provenance + replay bundle.
 *   5. Preflight signals (entity validation, crawlability,
 *      consistency).
 *   6. Raw JSON dumps for every field above, copy-friendly.
 */
export default async function AdminTracePage({
  params,
}: {
  params: { id: string };
}) {
  if (!isAuthed()) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <div className="mx-auto max-w-md">
            <p className="pill">Admin · Trace</p>
            <h1 className="h2 mt-3">Sign in</h1>
            <p className="muted mt-3 text-sm">
              Enter the admin password to view the internal audit trace.
            </p>

            {!getAdminPassword() ? (
              <div className="mt-6 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                <code>ADMIN_PASSWORD</code> is not set. Configure it in
                your environment to enable admin access.
              </div>
            ) : null}

            <form action={loginAction} className="card mt-6 space-y-4">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-white/85"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="input-field"
              />
              <button
                type="submit"
                className="btn-primary w-full justify-center"
              >
                Sign in
              </button>
            </form>
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <main>
        <Header />
        <section className="container-page py-16">
          <p className="muted">DATABASE_URL not configured.</p>
        </section>
        <Footer />
      </main>
    );
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    include: { intelligence: true },
  });

  if (!order) notFound();

  const intelligence = order.intelligence;
  const validations: ParsedValidations = parseAiValidations(
    intelligence?.aiValidations ?? null,
  );
  const consensus: ParsedConsensus = parseConsensusIndex(
    intelligence?.consensusIndex ?? null,
  );

  return (
    <main>
      <Header />
      <section className="container-page py-12">
        <div className="flex flex-col items-start gap-2">
          <p className="pill">Admin · Internal trace mode</p>
          <h1 className="h2 mt-2">Audit trace</h1>
          <p className="muted text-sm">
            Internal diagnostics only. Never embedded in the customer
            report. Surfaces raw validator outputs, deterministic score
            breakdown, preflight signals, and consensus computations.
          </p>
        </div>

        {/* Order header */}
        <div className="mt-8 card">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Order
              </p>
              <p className="mono-data mt-1 text-sm text-white/85">
                {order.id}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Website
              </p>
              <a
                href={order.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-block text-sm text-white hover:text-accent"
              >
                {order.websiteUrl}
              </a>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Email
              </p>
              <p className="mt-1 text-sm text-white/85">{order.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Created
              </p>
              <p className="mono-data mt-1 text-sm text-white/85">
                {new Date(order.createdAt).toISOString()}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Report status
              </p>
              <p className="mono-data mt-1 text-sm text-white/85">
                {order.reportStatus}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Audit model (prompt)
              </p>
              <p className="mono-data mt-1 text-sm text-white/85">
                {order.modelUsed ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Worker runtime
              </p>
              <p className="mono-data mt-1 text-sm text-white/85">
                {order.workerRuntimeMs
                  ? `${order.workerRuntimeMs} ms`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Tokens
              </p>
              <p className="mono-data mt-1 text-sm text-white/85">
                {order.inputTokens != null && order.outputTokens != null
                  ? `${order.inputTokens} → ${order.outputTokens}`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Per-provider validator panel */}
        <div className="mt-10">
          <h2 className="h3">1. Validator execution</h2>
          <p className="muted mt-2 text-sm">
            Per-provider status, timestamp, and failure reason where
            captured. Data sourced directly from{" "}
            <code className="mono-data text-white/80">
              AuditIntelligence.aiValidations
            </code>
            . On null, providers are reported as &quot;Not run&quot; — no
            participation is fabricated.
          </p>
          <div className="mt-4">
            <ProviderTelemetryGrid validations={validations} />
          </div>
        </div>

        {/* Consensus block */}
        <div className="mt-10">
          <h2 className="h3">2. Cross-model consensus</h2>
          <p className="muted mt-2 text-sm">
            Deterministic synthesis from validator outputs +
            deterministic category scores. Confidence index, verdict,
            agreement metrics. Sourced from{" "}
            <code className="mono-data text-white/80">
              AuditIntelligence.consensusIndex
            </code>
            .
          </p>
          <ConsensusSummary consensus={consensus} />
        </div>

        {/* Deterministic score */}
        <div className="mt-10">
          <h2 className="h3">3. Deterministic score</h2>
          <p className="muted mt-2 text-sm">
            Category scores, weights, bonuses, penalties — the primary
            scoring authority. Sourced from{" "}
            <code className="mono-data text-white/80">
              AuditIntelligence.deterministicScore
            </code>
            .
          </p>
          <DeterministicScorePanel
            deterministicScore={intelligence?.deterministicScore ?? null}
            overallScore={intelligence?.overallScore ?? null}
            semanticClarityScore={
              intelligence?.semanticClarityScore ?? null
            }
            crawlerAccessibilityScore={
              intelligence?.crawlerAccessibilityScore ?? null
            }
            trustSignalScore={intelligence?.trustSignalScore ?? null}
            structuredIdentityScore={
              intelligence?.structuredIdentityScore ?? null
            }
            recommendationReadinessScore={
              intelligence?.recommendationReadinessScore ?? null
            }
            renderabilityScore={intelligence?.renderabilityScore ?? null}
          />
        </div>

        {/* Raw JSON dumps */}
        <div className="mt-10">
          <h2 className="h3">4. Raw signals (copy-friendly)</h2>
          <p className="muted mt-2 text-sm">
            Full JSON for every persisted intelligence field. Use the
            Copy buttons to grab the raw payload for replay or
            diagnostics.
          </p>
          <div className="mt-4 space-y-6">
            <RawJsonBlock
              title="aiValidations"
              value={intelligence?.aiValidations}
            />
            <RawJsonBlock
              title="consensusIndex"
              value={intelligence?.consensusIndex}
            />
            <RawJsonBlock
              title="deterministicScore"
              value={intelligence?.deterministicScore}
            />
            <RawJsonBlock
              title="scoreProvenance"
              value={intelligence?.scoreProvenance}
            />
            <RawJsonBlock
              title="preflightSignals"
              value={intelligence?.preflightSignals}
            />
            <RawJsonBlock
              title="replayBundle"
              value={intelligence?.replayBundle}
            />
            <RawJsonBlock
              title="rawSignalSnapshot"
              value={intelligence?.rawSignalSnapshot ?? null}
            />
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

/**
 * Read-only consensus summary panel. Renders only the cross-model
 * synthesis labels + the agreement metrics that are NEVER surfaced to
 * customers. Falls back to "Not computed" when consensusIndex is null.
 */
function ConsensusSummary({ consensus }: { consensus: ParsedConsensus }) {
  if (!consensus) {
    return (
      <div className="mt-4 card">
        <p className="muted text-sm">
          Consensus not computed for this audit (either the consensus
          pipeline gate was off, or fewer than two validators passed).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <div className="card">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Verdict
        </p>
        <p className="mt-2 text-xl font-semibold text-white">
          {consensus.verdict ?? "—"}
        </p>
        <p className="muted mt-1 text-xs">
          confidence band: {consensus.confidence_band ?? "—"}
        </p>
      </div>
      <div className="card">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Confidence index
        </p>
        <p className="mono-data mt-2 text-3xl font-semibold text-white">
          {consensus.confidence_index != null
            ? consensus.confidence_index
            : "—"}
        </p>
        <p className="muted mt-1 text-xs">
          {consensus.consensus_confidence
            ? `consensus confidence: ${consensus.consensus_confidence}`
            : "—"}
        </p>
      </div>
      <div className="card">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Cross-model agreement
        </p>
        <p className="mt-2 text-xl font-semibold text-white">
          {consensus.model_agreement ?? "—"}
        </p>
        <p className="muted mt-1 text-xs">
          passed {consensus.agreement_metrics?.providers_passed ?? 0} /
          failed{" "}
          {consensus.agreement_metrics?.providers_failed ?? 0} /
          unavailable{" "}
          {consensus.agreement_metrics?.providers_unavailable ?? 0}
        </p>
      </div>

      {/* Dimensions */}
      {consensus.dimensions ? (
        <div className="card lg:col-span-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Dimensions
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(consensus.dimensions).map(([key, dim]) => (
              <div
                key={key}
                className="rounded-md border border-white/10 bg-white/[0.02] p-3"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                  {key.replace(/_/g, " ")}
                </p>
                <p className="mono-data mt-1 text-lg text-white">
                  {typeof dim?.score === "number" ? dim.score : "—"}
                </p>
                <p className="text-[11px] text-white/55">
                  {typeof dim?.level === "string" ? dim.level : "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Deterministic score breakdown. Renders the V2 deterministic scoring
 * artifact when present; falls back to the per-category columns on
 * AuditIntelligence for pre-v2 rows.
 */
function DeterministicScorePanel({
  deterministicScore,
  overallScore,
  semanticClarityScore,
  crawlerAccessibilityScore,
  trustSignalScore,
  structuredIdentityScore,
  recommendationReadinessScore,
  renderabilityScore,
}: {
  deterministicScore: unknown;
  overallScore: number | null;
  semanticClarityScore: number | null;
  crawlerAccessibilityScore: number | null;
  trustSignalScore: number | null;
  structuredIdentityScore: number | null;
  recommendationReadinessScore: number | null;
  renderabilityScore: number | null;
}) {
  const ds = isPlainObject(deterministicScore) ? deterministicScore : null;
  const dsOverall =
    ds && typeof ds.overall_score === "number" ? ds.overall_score : null;
  const dsCategories =
    ds && isPlainObject(ds.category_scores) ? ds.category_scores : null;
  const dsVersion =
    ds && typeof ds.scoring_version === "string" ? ds.scoring_version : null;
  const dsBonuses =
    ds && Array.isArray(ds.bonuses_applied) ? ds.bonuses_applied : null;
  const dsPenalties =
    ds && Array.isArray(ds.penalties_applied) ? ds.penalties_applied : null;

  // Fallback per-category rows from the AuditIntelligence scalar columns.
  const fallbackCategories: Array<{ label: string; score: number | null }> = [
    { label: "Semantic clarity", score: semanticClarityScore },
    { label: "Crawler accessibility", score: crawlerAccessibilityScore },
    { label: "Trust signals", score: trustSignalScore },
    { label: "Structured identity", score: structuredIdentityScore },
    {
      label: "Recommendation readiness",
      score: recommendationReadinessScore,
    },
    { label: "Renderability", score: renderabilityScore },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">
              Overall score
            </p>
            <p className="mono-data mt-1 text-3xl font-semibold text-white">
              {dsOverall ?? overallScore ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">
              Scoring version
            </p>
            <p className="mono-data mt-1 text-sm text-white/85">
              {dsVersion ?? "legacy (per-column)"}
            </p>
          </div>
        </div>

        {dsCategories ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(dsCategories).map(([key, raw]) => {
              const value = pickScoreFields(raw);
              return (
                <div
                  key={key}
                  className="rounded-md border border-white/10 bg-white/[0.02] p-3"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="mono-data mt-1 text-lg text-white">
                    {value.score ?? "—"}
                    {value.weight != null ? (
                      <span className="ml-1 text-xs text-white/45">
                        × {value.weight}
                      </span>
                    ) : null}
                  </p>
                  {value.band ? (
                    <p className="text-[11px] text-white/55">{value.band}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fallbackCategories.map((c) => (
              <div
                key={c.label}
                className="rounded-md border border-white/10 bg-white/[0.02] p-3"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                  {c.label}
                </p>
                <p className="mono-data mt-1 text-lg text-white">
                  {c.score ?? "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {dsBonuses && dsBonuses.length > 0 ? (
        <div className="card">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Bonuses applied
          </p>
          <ul className="mt-3 space-y-2">
            {dsBonuses.map((b, i) => (
              <li
                key={i}
                className="rounded-md border border-white/10 bg-white/[0.02] p-2.5 text-xs text-white/80"
              >
                <pre className="mono-data whitespace-pre-wrap break-words">
                  {JSON.stringify(b, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dsPenalties && dsPenalties.length > 0 ? (
        <div className="card">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Penalties applied
          </p>
          <ul className="mt-3 space-y-2">
            {dsPenalties.map((p, i) => (
              <li
                key={i}
                className="rounded-md border border-white/10 bg-white/[0.02] p-2.5 text-xs text-white/80"
              >
                <pre className="mono-data whitespace-pre-wrap break-words">
                  {JSON.stringify(p, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function pickScoreFields(raw: unknown): {
  score: number | null;
  weight: number | null;
  band: string | null;
} {
  if (typeof raw === "number") {
    return { score: raw, weight: null, band: null };
  }
  if (isPlainObject(raw)) {
    const score =
      typeof raw.score === "number"
        ? raw.score
        : typeof raw.value === "number"
          ? raw.value
          : null;
    const weight = typeof raw.weight === "number" ? raw.weight : null;
    const band =
      typeof raw.level === "string"
        ? raw.level
        : typeof raw.band === "string"
          ? raw.band
          : null;
    return { score, weight, band };
  }
  return { score: null, weight: null, band: null };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Raw JSON dump block with a copy-to-clipboard button.
 *
 * The button is a tiny client-island form whose onClick handler runs
 * the copy. We keep the surrounding panel as a server component and
 * render the JSON as a `<pre>` so the markup is searchable + copy-
 * friendly even without JS.
 */
function RawJsonBlock({ title, value }: { title: string; value: unknown }) {
  const isNull =
    value === null || value === undefined || value === "";
  const serialized = isNull
    ? "null"
    : safeStringify(value);

  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/60">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <p className="mono-data text-xs uppercase tracking-[0.18em] text-white/55">
          {title}
        </p>
        {isNull ? (
          <span className="pill">null</span>
        ) : (
          <CopyJsonButton text={serialized} label={`Copy ${title}`} />
        )}
      </div>
      <pre className="mono-data max-h-[420px] overflow-auto px-4 py-3 text-[11.5px] leading-snug text-white/80">
        {serialized}
      </pre>
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

