import type { ReactNode } from "react";

import { InlineProse } from "@/components/Prose";
import { SECTION_EYEBROWS } from "@/lib/report-sections";
import { clipDriverText, stripMarkdownMarkers } from "@/lib/parse-report";

/**
 * Four-Model Grid — report v2 "How AI Currently Understands Your
 * Business" section.
 *
 * Renders one card per AI system (ChatGPT, Claude, Gemini,
 * Perplexity) showing per-dimension verdicts derived from the
 * validator outputs already stored on AuditIntelligence.aiValidations.
 * Does NOT expose prompts, chain of thought, internal reasoning,
 * model weighting, scoring formulas, or proprietary methodology.
 * Only shows the per-dimension verdict and the knowledge-gaps text.
 *
 * Always renders four cards (one per canonical provider). When a
 * provider's output is missing from the validator layer's outputs
 * array, a synthetic "Status: Unavailable / Reason: ..." card takes
 * its place — the section never silently drops a provider.
 *
 * Fail-soft: when aiValidations is null entirely, the section
 * renders an "AI model analysis unavailable for this audit." panel
 * via <UnavailablePanel /> — the customer always sees the heading.
 */

type ValidatorOutputShape = {
  provider: string;
  status: string;
  business_understanding_score: number | null;
  category_confidence: string | null;
  service_area_confidence: string | null;
  recommendation_confidence: string | null;
  missing_facts?: string[];
  cited_sources?: string[];
  raw_summary?: string;
  error?: string | null;
  // Report-v3 rich fields. Optional — legacy audits lack them and
  // the card falls back to the compact verdict layout.
  industry_identified?: string;
  location_identified?: string;
  services_identified?: string[];
  would_recommend?: "YES" | "PARTIAL" | "NO";
  recommendation_reason?: string;
};

type ValidatorLayer = {
  outputs?: ValidatorOutputShape[];
} | null;

// Display labels keyed by the canonical PROVIDER_NAME each validator
// emits (see src/lib/validators/providers/*.ts — Claude declares
// "claude", not "anthropic"). Renames here = silent card drops.
const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

const PROVIDER_ORDER = ["openai", "claude", "gemini", "perplexity"] as const;

function syntheticMissing(provider: string): ValidatorOutputShape {
  return {
    provider,
    status: "unavailable",
    business_understanding_score: null,
    category_confidence: null,
    service_area_confidence: null,
    recommendation_confidence: null,
    missing_facts: [],
    cited_sources: [],
    raw_summary: "",
    error: "No response captured for this audit.",
  };
}

type Verdict = "Strong" | "Moderate" | "Weak";

function verdictFromConfidence(
  c: string | null,
): Verdict {
  if (c === "high") return "Strong";
  if (c === "medium") return "Moderate";
  return "Weak";
}

function verdictFromScore(score: number | null): Verdict {
  if (typeof score !== "number") return "Moderate";
  if (score >= 70) return "Strong";
  if (score >= 40) return "Moderate";
  return "Weak";
}

function verdictToneClass(v: Verdict): string {
  switch (v) {
    case "Strong":
      return "text-severity-info";
    case "Moderate":
      return "text-severity-warning";
    case "Weak":
      return "text-severity-critical";
  }
}

function knowledgeGapsText(o: ValidatorOutputShape): string {
  const facts = Array.isArray(o.missing_facts) ? o.missing_facts : [];
  if (facts.length === 0) {
    const summary = stripMarkdownMarkers((o.raw_summary ?? "").trim());
    return summary
      ? clipDriverText(summary, 140)
      : "No specific knowledge gaps surfaced.";
  }
  // Top three gaps, markdown-stripped, clipped, bullet-joined.
  const top = facts
    .slice(0, 3)
    .map((s) => clipDriverText(stripMarkdownMarkers(s), 70));
  return top.join(" • ");
}

function reasonText(o: ValidatorOutputShape): string {
  // Customer-facing failure-reason copy. Strips markdown markers so
  // raw LLM error blobs (`> *parse failed*`) never reach the PDF.
  const raw =
    o.error ??
    (o.raw_summary ? o.raw_summary.trim() : "") ??
    "Provider did not return a usable response.";
  const cleaned = stripMarkdownMarkers(raw).trim();
  return cleaned.length > 0
    ? clipDriverText(cleaned, 140)
    : "Provider did not return a usable response.";
}

function statusLabel(status: string): string {
  if (status === "passed") return "Reviewed";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Unavailable";
}

function isRich(o: ValidatorOutputShape): boolean {
  // Considered "rich" when at least the would_recommend + recommendation_reason
  // pair is present — those drive the most distinct section of the new
  // layout. Other rich fields render conditionally when present.
  return (
    typeof o.would_recommend === "string" &&
    typeof o.recommendation_reason === "string" &&
    o.recommendation_reason.trim().length > 0
  );
}

function recommendBadgeTone(v: "YES" | "PARTIAL" | "NO"): string {
  switch (v) {
    case "YES":
      return "text-severity-info border-severity-info/40 bg-severity-info/10";
    case "PARTIAL":
      return "text-severity-warning border-severity-warning/40 bg-severity-warning/10";
    case "NO":
      return "text-severity-critical border-severity-critical/40 bg-severity-critical/10";
  }
}

function businessIdentifiedAsText(o: ValidatorOutputShape): string {
  const summary = stripMarkdownMarkers((o.raw_summary ?? "").trim());
  if (summary.length === 0) {
    return o.industry_identified ?? "Not described by this AI system.";
  }
  return clipDriverText(summary, 220);
}

type DimensionRow = {
  label: string;
  verdict: Verdict;
};

function dimensionsFor(o: ValidatorOutputShape): DimensionRow[] | null {
  if (o.status !== "passed") return null;
  return [
    {
      label: "Business Identity",
      verdict: verdictFromScore(o.business_understanding_score),
    },
    {
      label: "Service Understanding",
      verdict: verdictFromConfidence(o.category_confidence),
    },
    {
      label: "Location Understanding",
      verdict: verdictFromConfidence(o.service_area_confidence),
    },
    {
      label: "Trust Confidence",
      verdict: verdictFromConfidence(o.recommendation_confidence),
    },
  ];
}

function UnavailablePanel() {
  return (
    <section
      className="report-section-card mt-10"
      aria-label="How AI currently understands your business — unavailable"
    >
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.howAiUnderstands}</p>
      </div>
      <h2 className="h2 mt-3">
        What each AI system can — and can&rsquo;t — tell about you.
      </h2>
      <p className="muted mt-3 text-sm leading-relaxed">
        AI model analysis unavailable for this audit.
      </p>
    </section>
  );
}

export function FourModelGrid({
  aiValidations,
}: {
  aiValidations: unknown;
}) {
  const layer = aiValidations as ValidatorLayer;
  if (!layer || !Array.isArray(layer.outputs) || layer.outputs.length === 0) {
    return <UnavailablePanel />;
  }

  // Index by canonical PROVIDER_NAME, then walk PROVIDER_ORDER and
  // synthesize a placeholder for any provider missing from outputs[].
  // ALWAYS emits exactly four cards — never silently drops a provider.
  const byProvider: Record<string, ValidatorOutputShape> = {};
  for (const o of layer.outputs) {
    if (o && typeof o.provider === "string") byProvider[o.provider] = o;
  }
  const ordered: ValidatorOutputShape[] = PROVIDER_ORDER.map(
    (p) => byProvider[p] ?? syntheticMissing(p),
  );

  return (
    <section className="report-section-card mt-10">
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.howAiUnderstands}</p>
        <span className="pill">{PROVIDER_ORDER.length} AI SYSTEMS REVIEWED</span>
      </div>
      <h2 className="h2 mt-3">
        What each AI system can — and can&rsquo;t — tell about you.
      </h2>
      <p className="muted mt-2 max-w-2xl text-sm leading-relaxed">
        Each card summarizes how clearly four major AI systems can
        identify your business, services, location, and trustworthiness
        from publicly accessible signals.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ordered.map((o) => {
          const display = PROVIDER_DISPLAY[o.provider] ?? o.provider;
          const dimensions = dimensionsFor(o);
          const unavailable = dimensions === null;
          const rich = !unavailable && isRich(o);
          return (
            <div
              key={o.provider}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white/85">{display}</p>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    unavailable ? "text-white/45" : "text-severity-info"
                  }`}
                >
                  {statusLabel(o.status)}
                </span>
              </div>
              {unavailable ? (
                <dl className="mt-3 grid gap-y-2 text-[12px]">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                      Status
                    </dt>
                    <dd className="font-semibold text-white/75">
                      Unavailable
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                      Reason
                    </dt>
                    <dd className="leading-relaxed text-white/65">
                      <InlineProse>{reasonText(o)}</InlineProse>
                    </dd>
                  </div>
                </dl>
              ) : rich ? (
                <RichCardBody o={o} display={display} />
              ) : (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                    {dimensions!.map((d) => (
                      <div
                        key={d.label}
                        className="flex flex-col gap-0.5"
                      >
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                          {d.label}
                        </dt>
                        <dd
                          className={`font-semibold ${verdictToneClass(d.verdict)}`}
                        >
                          {d.verdict}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 border-t border-white/[0.05] pt-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                      Knowledge gaps
                    </p>
                    <div className="mt-1 text-[12px] leading-relaxed text-white/70">
                      <InlineProse>{knowledgeGapsText(o)}</InlineProse>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RichCardBody({
  o,
  display,
}: {
  o: ValidatorOutputShape;
  display: string;
}) {
  const services = (o.services_identified ?? []).filter(
    (s) => s.trim().length > 0,
  );
  const missing = (o.missing_facts ?? []).filter((s) => s.trim().length > 0);
  const wouldRecommend = o.would_recommend;

  return (
    <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-white/75">
      <RichField label={`How ${display} sees the business`}>
        <InlineProse>
          {stripMarkdownMarkers(businessIdentifiedAsText(o))}
        </InlineProse>
      </RichField>
      {o.industry_identified ? (
        <RichField label="Industry understood">
          <InlineProse>
            {stripMarkdownMarkers(o.industry_identified)}
          </InlineProse>
        </RichField>
      ) : null}
      {o.location_identified ? (
        <RichField label="Location understood">
          <InlineProse>
            {stripMarkdownMarkers(o.location_identified)}
          </InlineProse>
        </RichField>
      ) : null}
      {services.length > 0 ? (
        <RichField label="Services understood">
          <ul className="mt-1 space-y-1">
            {services.slice(0, 5).map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-[5px] text-white/30">
                  •
                </span>
                <span>
                  <InlineProse>{stripMarkdownMarkers(s)}</InlineProse>
                </span>
              </li>
            ))}
          </ul>
        </RichField>
      ) : null}
      {missing.length > 0 ? (
        <RichField label={`What ${display} is missing`}>
          <ul className="mt-1 space-y-1">
            {missing.slice(0, 5).map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-[5px] text-white/30">
                  •
                </span>
                <span>
                  <InlineProse>{stripMarkdownMarkers(s)}</InlineProse>
                </span>
              </li>
            ))}
          </ul>
        </RichField>
      ) : null}
      <ConfidenceLevels o={o} />
      <SourcesUsed o={o} />
      <div className="border-t border-white/[0.05] pt-3">
        <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">
          Would {display} comfortably recommend this business?
        </p>
        <div className="mt-1.5 flex items-baseline gap-3">
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-[0.14em] ${
              wouldRecommend
                ? recommendBadgeTone(wouldRecommend)
                : "border-white/[0.08] bg-white/[0.02] text-white/50"
            }`}
          >
            {wouldRecommend ?? "—"}
          </span>
        </div>
        {o.recommendation_reason ? (
          <div className="mt-2 text-white/70">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/40">
              Reason:&nbsp;
            </span>
            <InlineProse>
              {stripMarkdownMarkers(o.recommendation_reason)}
            </InlineProse>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RichField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function confidenceLabel(c: string | null): {
  text: string;
  tone: string;
} | null {
  if (c === "high") return { text: "High", tone: "text-severity-info" };
  if (c === "medium")
    return { text: "Medium", tone: "text-severity-warning" };
  if (c === "low") return { text: "Low", tone: "text-severity-critical" };
  return null;
}

function ConfidenceLevels({ o }: { o: ValidatorOutputShape }) {
  const rows = [
    { label: "Industry", c: confidenceLabel(o.category_confidence) },
    { label: "Service area", c: confidenceLabel(o.service_area_confidence) },
    {
      label: "Recommendation",
      c: confidenceLabel(o.recommendation_confidence),
    },
  ].filter((r) => r.c !== null) as Array<{
    label: string;
    c: { text: string; tone: string };
  }>;

  if (rows.length === 0) return null;

  return (
    <RichField label="Confidence levels">
      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5">
            <dt className="text-[9px] uppercase tracking-[0.12em] text-white/40">
              {r.label}
            </dt>
            <dd className={`font-semibold ${r.c.tone}`}>{r.c.text}</dd>
          </div>
        ))}
      </dl>
    </RichField>
  );
}

function SourcesUsed({ o }: { o: ValidatorOutputShape }) {
  const sources = (o.cited_sources ?? [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sources.length === 0) return null;

  const top = sources.slice(0, 5);
  return (
    <RichField label="Sources used">
      <ul className="mt-1 space-y-1">
        {top.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden className="mt-[5px] text-white/30">
              •
            </span>
            <span className="break-all text-white/65">
              {stripMarkdownMarkers(s)}
            </span>
          </li>
        ))}
      </ul>
    </RichField>
  );
}
