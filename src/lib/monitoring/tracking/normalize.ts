/**
 * Provider answer → storable sample (pure).
 *
 * - Mentions: deterministic detector over the full answer text, the names
 *   the list extractor found, and cited domains.
 * - Position: only from a clear ordered recommendation list
 *   (`positionStatus: "ranked"`); otherwise null with the reason
 *   (`not_in_list` / `no_ordered_list`). Never 0, never inferred from the
 *   order businesses happen to appear in prose.
 * - A failed or unknown-outcome call is NOT_MEASURED with every measurement
 *   null/empty — never "not mentioned", never a zero.
 */
import { extractUrlsFromText, mergeCitations } from "./citations";
import { DETECTOR_VERSION, type EntityMatcher } from "./detector";
import { EXTRACTOR_VERSION, extractRecommendationList } from "./list-extractor";
import { estimateSampleCost } from "./pricing";
import type { NormalizedResult, ProviderAnswer, SearchSettings, TrackingProvider } from "./types";

const ANSWER_TEXT_LIMIT = 20_000;

export function configFingerprint(args: {
  promptVersion: string;
  provider: string;
  model: string | null;
  searchSettings: SearchSettings | null;
}): string {
  const s = args.searchSettings;
  const search = s ? `${s.grounding}:${s.tool ?? "none"}${s.contextSize ? `:${s.contextSize}` : ""}` : "unknown";
  return [args.promptVersion, args.provider, args.model ?? "unknown", search, EXTRACTOR_VERSION, DETECTOR_VERSION].join("|");
}

export function normalizeProviderAnswer(
  answer: ProviderAnswer,
  customer: EntityMatcher,
  competitors: EntityMatcher[],
  promptVersion: string,
): NormalizedResult {
  if (!answer.ok) {
    return {
      status: "not_measured",
      callState: answer.outcome === "unknown" ? "unknown" : "failed",
      errorCode: answer.errorCode,
      errorMessage: answer.errorMessage.slice(0, 500),
      groundingMode: null,
      searchSettings: null,
      model: answer.model,
      promptVersion,
      extractorVersion: null,
      configFingerprint: null,
      mentioned: null,
      position: null,
      positionStatus: "not_measured",
      citedUrls: [],
      citedDomains: [],
      namedBusinesses: [],
      competitorIdsMentioned: [],
      matchEvidence: null,
      detectorVersion: null,
      answerText: null,
      rawResponse: null,
      providerRequestId: answer.providerRequestId ?? null,
      inputTokens: null,
      outputTokens: null,
      searchCalls: null,
      costUsd: null,
      costSource: null,
      latencyMs: answer.latencyMs,
    };
  }

  const { urls, domains } = mergeCitations(answer.nativeCitationUrls, extractUrlsFromText(answer.answerText));
  const list = extractRecommendationList(answer.answerText);
  const input = { answerText: answer.answerText, namedBusinesses: list.namedBusinesses, citedDomains: domains };
  const customerMatch = customer.match(input);

  let position: number | null = null;
  let positionStatus: NormalizedResult["positionStatus"] = "no_ordered_list";
  if (list.orderedList) {
    const idx = list.orderedList.findIndex((n) => customer.matchName(n));
    if (idx >= 0) {
      position = idx + 1;
      positionStatus = "ranked";
    } else {
      positionStatus = "not_in_list";
    }
  }

  const cost = estimateSampleCost(answer.provider as TrackingProvider, answer.usage);
  return {
    status: "measured",
    callState: "completed",
    errorCode: null,
    errorMessage: null,
    groundingMode: answer.searchSettings.grounding,
    searchSettings: answer.searchSettings,
    model: answer.model,
    promptVersion,
    extractorVersion: EXTRACTOR_VERSION,
    configFingerprint: configFingerprint({ promptVersion, provider: answer.provider, model: answer.model, searchSettings: answer.searchSettings }),
    mentioned: customerMatch.matched,
    position,
    positionStatus,
    citedUrls: urls,
    citedDomains: domains,
    namedBusinesses: list.namedBusinesses,
    competitorIdsMentioned: competitors.filter((c) => c.match(input).matched).map((c) => c.entity.id),
    matchEvidence: { matchedBy: customerMatch.matchedBy, matchedText: customerMatch.matchedText },
    detectorVersion: DETECTOR_VERSION,
    answerText: answer.answerText.slice(0, ANSWER_TEXT_LIMIT),
    rawResponse: answer.raw,
    providerRequestId: answer.providerRequestId,
    inputTokens: answer.usage?.inputTokens ?? null,
    outputTokens: answer.usage?.outputTokens ?? null,
    searchCalls: answer.usage?.searchCalls ?? null,
    costUsd: cost.costUsd,
    costSource: cost.costSource,
    latencyMs: answer.latencyMs,
  };
}
