import { SECTION_EYEBROWS } from "@/lib/report-sections";
import { clipDriverText } from "@/lib/parse-report";

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
 * Sits BEFORE the existing CrossModelIntelligence card in the report
 * shell. Both can be rendered together — this is the customer-
 * language read; the existing card carries the technical consensus
 * strip.
 *
 * Fail-soft: when aiValidations is null or all providers failed, the
 * section renders nothing.
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

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

const PROVIDER_ORDER = ["openai", "anthropic", "gemini", "perplexity"] as const;

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
  if (o.status !== "passed") {
    return o.error
      ? `Analysis unavailable — ${clipDriverText(o.error, 60)}`
      : "Analysis unavailable.";
  }
  const facts = Array.isArray(o.missing_facts) ? o.missing_facts : [];
  if (facts.length === 0) {
    const summary = (o.raw_summary ?? "").trim();
    return summary
      ? clipDriverText(summary, 140)
      : "No specific knowledge gaps surfaced.";
  }
  // Take the top three gaps, clipped, joined with sentence breaks.
  const top = facts.slice(0, 3).map((s) => clipDriverText(s, 70));
  return top.join(" • ");
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

export function FourModelGrid({
  aiValidations,
}: {
  aiValidations: unknown;
}) {
  const layer = aiValidations as ValidatorLayer;
  if (!layer || !Array.isArray(layer.outputs) || layer.outputs.length === 0) {
    return null;
  }

  // Index by provider name, emit in canonical display order. Unknown
  // providers are dropped — we never invent a card.
  const byProvider: Record<string, ValidatorOutputShape> = {};
  for (const o of layer.outputs) {
    if (o && typeof o.provider === "string") byProvider[o.provider] = o;
  }
  const ordered = PROVIDER_ORDER.map((p) => byProvider[p]).filter(
    (o): o is ValidatorOutputShape => o !== undefined,
  );
  if (ordered.length === 0) return null;

  return (
    <section className="report-section-card mt-10">
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.howAiUnderstands}</p>
        <span className="pill">{ordered.length} models</span>
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
          const gaps = knowledgeGapsText(o);
          return (
            <div
              key={o.provider}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white/85">{display}</p>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    unavailable
                      ? "text-white/40"
                      : "text-severity-info"
                  }`}
                >
                  {unavailable ? "Analysis unavailable" : "Reviewed"}
                </span>
              </div>
              {unavailable ? (
                <p className="mt-3 text-[12px] leading-relaxed text-white/55">
                  {gaps}
                </p>
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
                    <p className="mt-1 text-[12px] leading-relaxed text-white/70">
                      {gaps}
                    </p>
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
