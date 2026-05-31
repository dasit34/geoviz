/**
 * Per-audit validator execution panel.
 *
 * Renders OpenAI / Anthropic / Gemini / Perplexity / Google AI
 * Overview each with their captured status, timestamp, and (when
 * available) error reason.
 *
 * Data source is `AuditIntelligence.aiValidations` — a `Json?`
 * column on the AuditOrder relation. The orchestrator persists this
 * blob only when the consensus pipeline gate is enabled AND at least
 * one validator returned. When the gate is off, the column is null
 * and we render every provider as "Not run" — we never fabricate
 * provider participation.
 *
 * Latency / per-call tokens are intentionally OPTIONAL in the parsed
 * shape: the production `NormalizedValidationOutput` contract
 * (src/lib/validators/types.ts) does not currently capture either, so
 * the UI degrades to "—" in the latency / tokens slot. The shape is
 * forward-compatible with a future provider-contract extension that
 * adds `duration_ms` / `usage`.
 */

import type { ReactNode } from "react";

export type ProviderStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "unavailable"
  | "not_run";

export type ParsedProviderOutput = {
  provider: string;
  status: ProviderStatus;
  business_understanding_score: number | null;
  category_confidence: string | null;
  service_area_confidence: string | null;
  recommendation_confidence: string | null;
  missing_facts: string[];
  cited_sources: string[];
  raw_summary: string;
  error: string | null;
  // Optional fields — present only if a future provider contract
  // captures them. Currently `null` for every persisted row.
  duration_ms: number | null;
  tokens: number | null;
  model_id: string | null;
};

export type ParsedValidations = {
  enabled: boolean;
  ran_at: string | null;
  outputs: ParsedProviderOutput[];
  // True when AuditIntelligence.aiValidations was null on the row —
  // i.e. the validator step did not run for this audit. Drives the
  // "Not run" rendering for every provider.
  notRun: boolean;
};

export type ParsedDimensions = Record<
  string,
  { score: number | null; level: string | null }
>;

export type ParsedConsensus =
  | {
      verdict: string | null;
      confidence_index: number | null;
      confidence_band: string | null;
      consensus_confidence: string | null;
      model_agreement: string | null;
      dimensions: ParsedDimensions | null;
      agreement_metrics: {
        providers_passed: number;
        providers_failed: number;
        providers_unavailable: number;
        business_understanding_stdev: number | null;
        category_confidence_majority: string | null;
        service_area_confidence_majority: string | null;
        recommendation_confidence_majority: string | null;
        agreement_label: string | null;
      } | null;
      strong_signals: string[];
      visibility_gaps: string[];
      immediate_actions: string[];
    }
  | null;

// Fixed display order — mirrors src/lib/validators/registry.ts so the
// admin grid lines up with the validator pipeline boot log.
const PROVIDER_ORDER: ReadonlyArray<{
  key: string;
  label: string;
  /** Aliases under which this provider can appear in aiValidations.outputs.
   *  Older rows used "openai" / "anthropic" / etc. directly. Newer providers
   *  may emit a slightly different `provider` field; this lets the UI key
   *  by either form without dropping rows. */
  aliases: string[];
}> = [
  { key: "openai", label: "OpenAI", aliases: ["openai", "chatgpt"] },
  { key: "anthropic", label: "Anthropic", aliases: ["anthropic", "claude"] },
  { key: "gemini", label: "Gemini", aliases: ["gemini", "google_gemini"] },
  {
    key: "perplexity",
    label: "Perplexity",
    aliases: ["perplexity"],
  },
  {
    key: "google_ai_overview",
    label: "Google AI Overview",
    aliases: ["google_ai_overview", "google-ai-overview", "googleAIOverview"],
  },
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function normalizeStatus(v: unknown): ProviderStatus {
  if (typeof v !== "string") return "not_run";
  switch (v) {
    case "passed":
    case "failed":
    case "skipped":
    case "unavailable":
      return v;
    default:
      return "not_run";
  }
}

/**
 * Parse the persisted `AuditIntelligence.aiValidations` JSON into a
 * stable shape for the UI. Tolerates legacy / partial payloads. On
 * `null` returns `{ notRun: true }` so the UI never shows fabricated
 * status pills.
 */
export function parseAiValidations(raw: unknown): ParsedValidations {
  if (raw == null) {
    return { enabled: false, ran_at: null, outputs: [], notRun: true };
  }
  if (!isPlainObject(raw)) {
    return { enabled: false, ran_at: null, outputs: [], notRun: true };
  }
  const outputsRaw = Array.isArray(raw.outputs) ? raw.outputs : [];
  const outputs: ParsedProviderOutput[] = outputsRaw
    .map((o): ParsedProviderOutput | null => {
      if (!isPlainObject(o)) return null;
      const provider = asString(o.provider);
      if (!provider) return null;
      return {
        provider,
        status: normalizeStatus(o.status),
        business_understanding_score: asNumber(o.business_understanding_score),
        category_confidence: asString(o.category_confidence),
        service_area_confidence: asString(o.service_area_confidence),
        recommendation_confidence: asString(o.recommendation_confidence),
        missing_facts: asStringArray(o.missing_facts),
        cited_sources: asStringArray(o.cited_sources),
        raw_summary: asString(o.raw_summary) ?? "",
        error: asString(o.error),
        duration_ms: asNumber(o.duration_ms),
        tokens: asNumber(o.tokens),
        model_id: asString(o.model_id),
      };
    })
    .filter((o): o is ParsedProviderOutput => o !== null);

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : outputs.length > 0,
    ran_at: asString(raw.ran_at),
    outputs,
    notRun: outputs.length === 0,
  };
}

/**
 * Parse the persisted `AuditIntelligence.consensusIndex` JSON into a
 * stable shape. Tolerates partial payloads. Returns `null` when the
 * column is null OR when the payload is structurally unusable.
 */
export function parseConsensusIndex(raw: unknown): ParsedConsensus {
  if (raw == null || !isPlainObject(raw)) return null;
  const dimensionsRaw = isPlainObject(raw.dimensions) ? raw.dimensions : null;
  const dimensions: ParsedDimensions | null = dimensionsRaw
    ? Object.fromEntries(
        Object.entries(dimensionsRaw).map(([k, v]) => [
          k,
          {
            score: isPlainObject(v) ? asNumber(v.score) : null,
            level: isPlainObject(v) ? asString(v.level) : null,
          },
        ]),
      )
    : null;
  const am = isPlainObject(raw.agreement_metrics)
    ? raw.agreement_metrics
    : null;
  return {
    verdict: asString(raw.verdict),
    confidence_index: asNumber(raw.confidence_index),
    confidence_band: asString(raw.confidence_band),
    consensus_confidence: asString(raw.consensus_confidence),
    model_agreement: asString(raw.model_agreement),
    dimensions,
    agreement_metrics: am
      ? {
          providers_passed: asNumber(am.providers_passed) ?? 0,
          providers_failed: asNumber(am.providers_failed) ?? 0,
          providers_unavailable: asNumber(am.providers_unavailable) ?? 0,
          business_understanding_stdev: asNumber(
            am.business_understanding_stdev,
          ),
          category_confidence_majority: asString(
            am.category_confidence_majority,
          ),
          service_area_confidence_majority: asString(
            am.service_area_confidence_majority,
          ),
          recommendation_confidence_majority: asString(
            am.recommendation_confidence_majority,
          ),
          agreement_label: asString(am.agreement_label),
        }
      : null,
    strong_signals: asStringArray(raw.strong_signals),
    visibility_gaps: asStringArray(raw.visibility_gaps),
    immediate_actions: asStringArray(raw.immediate_actions),
  };
}

function findOutputForProvider(
  outputs: ParsedProviderOutput[],
  aliases: string[],
): ParsedProviderOutput | null {
  const lc = aliases.map((a) => a.toLowerCase());
  for (const o of outputs) {
    if (lc.includes(o.provider.toLowerCase())) return o;
  }
  return null;
}

/**
 * Reusable status pill. Reuses the existing `pill` utility class +
 * severity color tokens from tailwind.config.ts (per the track-rules:
 * critical for FAILED, warning for partial, info for SKIPPED/SUCCESS).
 * No new style files are introduced.
 */
export function ValidatorStatusPill({ status }: { status: ProviderStatus }) {
  const map: Record<
    ProviderStatus,
    { label: string; toneClass: string; glyph: ReactNode }
  > = {
    passed: {
      label: "SUCCESS",
      toneClass:
        "border-severity-info/40 bg-severity-info/10 text-severity-info",
      glyph: <span aria-hidden>✓</span>,
    },
    failed: {
      label: "FAILED",
      toneClass:
        "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
      glyph: <span aria-hidden>✗</span>,
    },
    skipped: {
      label: "SKIPPED",
      toneClass:
        "border-cyan/40 bg-cyan/10 text-cyan",
      glyph: <span aria-hidden>·</span>,
    },
    unavailable: {
      label: "UNAVAILABLE",
      toneClass: "border-white/15 bg-white/[0.04] text-white/55",
      glyph: <span aria-hidden>—</span>,
    },
    not_run: {
      label: "NOT RUN",
      toneClass: "border-white/10 bg-white/[0.02] text-white/40",
      glyph: <span aria-hidden>○</span>,
    },
  };
  const t = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${t.toneClass}`}
    >
      {t.glyph}
      <span>{t.label}</span>
    </span>
  );
}

/**
 * Full per-provider grid. One row per provider, fields:
 *
 *   Provider · Status · Latency · Tokens · Model · Timestamp · Reason
 *
 * Latency / Tokens / Model are rendered "—" when the provider
 * contract did not capture them.
 *
 * Compact variant (no business-understanding-score, no missing-facts
 * column) is used on the admin orders list. The trace page renders
 * the full variant.
 */
export function ProviderTelemetryGrid({
  validations,
  compact = false,
}: {
  validations: ParsedValidations;
  compact?: boolean;
}) {
  const rows = PROVIDER_ORDER.map((p) => {
    const out = findOutputForProvider(validations.outputs, p.aliases);
    return {
      key: p.key,
      label: p.label,
      output: out,
    };
  });

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-900/60">
      <div
        className={`grid border-b border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-[10.5px] uppercase tracking-[0.18em] text-white/45 ${compact ? "grid-cols-[1.2fr_0.9fr_0.7fr_1.3fr]" : "grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr_1fr_1.3fr_2fr]"}`}
      >
        <div>Provider</div>
        <div>Status</div>
        <div>Latency</div>
        {!compact ? <div>Tokens</div> : null}
        {!compact ? <div>Model</div> : null}
        <div>Timestamp</div>
        <div>Reason</div>
      </div>
      <ul className="divide-y divide-white/[0.05]">
        {rows.map(({ key, label, output }) => {
          const status: ProviderStatus = validations.notRun
            ? "not_run"
            : (output?.status ?? "not_run");
          const latency = output?.duration_ms;
          const tokens = output?.tokens;
          const model = output?.model_id;
          const reason = output?.error ?? (output?.raw_summary ? "" : null);
          const ranAt =
            !validations.notRun && validations.ran_at ? validations.ran_at : null;
          return (
            <li
              key={key}
              className={`grid items-center px-4 py-2.5 text-xs text-white/75 ${compact ? "grid-cols-[1.2fr_0.9fr_0.7fr_1.3fr]" : "grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr_1fr_1.3fr_2fr]"}`}
            >
              <div className="font-medium text-white/90">{label}</div>
              <div>
                <ValidatorStatusPill status={status} />
              </div>
              <div className="mono-data text-white/65">
                {latency != null ? `${latency} ms` : "—"}
              </div>
              {!compact ? (
                <div className="mono-data text-white/65">
                  {tokens != null ? tokens : "—"}
                </div>
              ) : null}
              {!compact ? (
                <div className="mono-data text-white/65">
                  {model ?? "—"}
                </div>
              ) : null}
              <div className="mono-data text-white/55">
                {ranAt ? formatTimestamp(ranAt) : "—"}
              </div>
              <div className="text-white/65">
                {validations.notRun ? (
                  <span className="muted">
                    Validator step did not run for this audit
                  </span>
                ) : reason ? (
                  <span title={reason} className="line-clamp-2 break-words">
                    {reason}
                  </span>
                ) : status === "passed" ? (
                  <span className="muted">—</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  // Keep the raw ISO string visible for copy/paste use while still
  // showing the operator a human-readable local timestamp.
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  } catch {
    return iso;
  }
}

/**
 * Compact one-line provider strip — five chips on a single row.
 * Designed for the orders queue table where each order has limited
 * vertical space. Renders the same status semantics as the full grid.
 */
export function ProviderStatusStrip({
  validations,
}: {
  validations: ParsedValidations;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {PROVIDER_ORDER.map((p) => {
        const out = findOutputForProvider(validations.outputs, p.aliases);
        const status: ProviderStatus = validations.notRun
          ? "not_run"
          : (out?.status ?? "not_run");
        const tone =
          status === "passed"
            ? "text-severity-info"
            : status === "failed"
              ? "text-severity-critical"
              : status === "unavailable"
                ? "text-white/40"
                : status === "skipped"
                  ? "text-cyan"
                  : "text-white/30";
        const glyph =
          status === "passed"
            ? "✓"
            : status === "failed"
              ? "✗"
              : status === "unavailable"
                ? "—"
                : status === "skipped"
                  ? "·"
                  : "○";
        const title = validations.notRun
          ? `${p.label}: not run`
          : `${p.label}: ${status}${out?.error ? ` — ${out.error}` : ""}`;
        return (
          <span
            key={p.key}
            title={title}
            className="inline-flex items-baseline gap-1 text-[11px]"
          >
            <span className={`mono-data ${tone}`}>{glyph}</span>
            <span className="text-white/55">{p.label}</span>
          </span>
        );
      })}
    </div>
  );
}
