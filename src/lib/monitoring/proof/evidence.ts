/**
 * Proof Engine v1 — measurement evidence for one question × provider sample.
 *
 * Read-only view over an immutable PromptRunResult. Rules:
 *   - "Sources" are ONLY the citations the provider itself returned
 *     (rawResponse.citations). URLs written inside the answer text are listed
 *     separately and never presented as provider sources. Nothing is inferred:
 *     with no provider citations the view says so explicitly.
 *   - Sentiment is reported only when the answer contains an explicit
 *     evaluative phrase in the same sentence that names the business;
 *     otherwise it is null ("not stated").
 *   - Results are labelled as API measurements, not consumer-app answers.
 */
import { extractUrlsFromText, normalizeCitationUrl } from "../tracking/citations";
import { normalizeDomain } from "@/lib/business/normalize-domain";

export const SENTIMENT_DETECTOR_VERSION = "sentiment@1.0.0";
export const NO_SOURCE_LABEL = "No source returned by this provider";

export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  claude: "Anthropic Claude",
  gemini: "Google Gemini",
  perplexity: "Perplexity",
};

/** The subset of a PromptRunResult row the evidence view reads. */
export type RunRow = {
  id: string;
  trackedPromptId: string;
  provider: string;
  sampleIndex: number;
  model: string | null;
  status: string;
  callState: string;
  errorCode: string | null;
  errorMessage: string | null;
  groundingMode: string | null;
  answerText: string | null;
  mentioned: boolean | null;
  position: number | null;
  positionStatus: string | null;
  namedBusinesses: unknown;
  competitorIdsMentioned: unknown;
  citedUrls: unknown;
  rawResponse: unknown;
  matchEvidence: unknown;
  claimedAt: Date;
  completedAt: Date | null;
};

export type ProviderSource = { url: string; domain: string | null; title: string | null; citedText: string | null };

export type Sentiment = { label: "positive" | "negative" | "mixed"; quote: string; detectorVersion: string } | null;

export type RunEvidence = {
  resultId: string;
  provider: string;
  providerLabel: string;
  model: string | null;
  accessLabel: string;
  at: Date;
  question: string;
  status: "measured" | "not_measured";
  callState: string;
  error: { code: string | null; message: string | null } | null;
  response: string | null;
  mentioned: boolean | null;
  position: number | null;
  positionNote: string;
  competitorsMentioned: string[];
  namedBusinesses: string[];
  sentiment: Sentiment;
  /** Citations returned by the provider (empty when it returned none). */
  sources: ProviderSource[];
  sourcesNote: string | null;
  /** URLs that appear in the answer text but were NOT returned as provider citations. */
  urlsInAnswer: string[];
};

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Provider-native citations only, from the stored raw capture. */
export function providerSources(rawResponse: unknown): ProviderSource[] {
  const raw = rawResponse as { citations?: unknown } | null;
  if (!raw || !Array.isArray(raw.citations)) return [];
  const out: ProviderSource[] = [];
  const seen = new Set<string>();
  for (const c of raw.citations as Array<{ url?: unknown; title?: unknown; citedText?: unknown }>) {
    if (typeof c?.url !== "string") continue;
    const url = normalizeCitationUrl(c.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      domain: normalizeDomain(url),
      title: typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 200) : null,
      citedText: typeof c.citedText === "string" && c.citedText.trim() ? c.citedText.trim().slice(0, 300) : null,
    });
  }
  return out;
}

/** URLs written in the answer that the provider did not also return as citations. */
export function answerOnlyUrls(answerText: string | null, sources: ProviderSource[]): string[] {
  const native = new Set(sources.map((s) => s.url));
  const out: string[] = [];
  for (const raw of extractUrlsFromText(answerText)) {
    const u = normalizeCitationUrl(raw);
    if (u && !native.has(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

const POSITIVE = ["highly recommend", "highly rated", "top-rated", "top rated", "well-regarded", "well regarded", "reputable", "trusted", "excellent reviews", "positive reviews", "is a good choice", "is a great choice", "is a strong choice", "stands out"];
const NEGATIVE = ["complaints", "negative reviews", "poor reviews", "bad reviews", "not recommended", "avoid", "scam", "unreliable", "lawsuit", "poor customer service"];

/**
 * Sentiment only from explicit language in a sentence that names the business.
 * Returns null when nothing explicit is stated — never a guess.
 */
export function detectExplicitSentiment(answerText: string | null, businessTerms: string[]): Sentiment {
  if (!answerText) return null;
  const terms = businessTerms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
  if (terms.length === 0) return null;
  const sentences = answerText.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  let pos: string | null = null;
  let neg: string | null = null;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (!terms.some((t) => lower.includes(t))) continue;
    if (!pos && POSITIVE.some((p) => lower.includes(p))) pos = sentence;
    if (!neg && NEGATIVE.some((p) => lower.includes(p))) neg = sentence;
  }
  if (pos && neg) return { label: "mixed", quote: `${pos} … ${neg}`.slice(0, 400), detectorVersion: SENTIMENT_DETECTOR_VERSION };
  if (pos) return { label: "positive", quote: pos.slice(0, 400), detectorVersion: SENTIMENT_DETECTOR_VERSION };
  if (neg) return { label: "negative", quote: neg.slice(0, 400), detectorVersion: SENTIMENT_DETECTOR_VERSION };
  return null;
}

function positionNote(row: RunRow): string {
  switch (row.positionStatus) {
    case "ranked":
      return `Position ${row.position} in a numbered list`;
    case "not_in_list":
      return "Answer had a numbered list; the business wasn't in it";
    case "no_ordered_list":
      return "No numbered list in the answer — position not determinable";
    default:
      return "Not measured";
  }
}

export function accessLabel(provider: string, model: string | null, groundingMode: string | null): string {
  const who = PROVIDER_LABELS[provider] ?? provider;
  const search = groundingMode === "web_search" ? "web search on" : groundingMode === "none" ? "web search off" : "search setting unknown";
  return `Measured through the ${who} API (${model ?? "model not reported"}, ${search}). API answers are not identical to the consumer ChatGPT, Claude, Gemini or Perplexity apps.`;
}

export function buildRunEvidence(
  row: RunRow,
  question: string,
  opts: { businessTerms: string[]; competitorNames: Record<string, string> },
): RunEvidence {
  const measured = row.status === "measured";
  const sources = measured ? providerSources(row.rawResponse) : [];
  return {
    resultId: row.id,
    provider: row.provider,
    providerLabel: PROVIDER_LABELS[row.provider] ?? row.provider,
    model: row.model,
    accessLabel: accessLabel(row.provider, row.model, row.groundingMode),
    at: row.completedAt ?? row.claimedAt,
    question,
    status: measured ? "measured" : "not_measured",
    callState: row.callState,
    error: measured ? null : { code: row.errorCode, message: row.errorMessage },
    response: row.answerText,
    mentioned: measured ? row.mentioned : null,
    position: measured && row.positionStatus === "ranked" ? row.position : null,
    positionNote: measured ? positionNote(row) : "Not measured",
    competitorsMentioned: strArr(row.competitorIdsMentioned).map((id) => opts.competitorNames[id] ?? id),
    namedBusinesses: strArr(row.namedBusinesses),
    sentiment: measured ? detectExplicitSentiment(row.answerText, opts.businessTerms) : null,
    sources,
    sourcesNote: measured && sources.length === 0 ? NO_SOURCE_LABEL : null,
    urlsInAnswer: measured ? answerOnlyUrls(row.answerText, sources) : [],
  };
}
