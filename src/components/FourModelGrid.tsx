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
