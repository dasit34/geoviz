/**
 * Provider answer → storable result (pure). A failed provider call is
 * NOT_MEASURED with every measurement null/empty — never "not mentioned"
 * and never a zero.
 */
import { extractUrlsFromText, mergeCitations } from "./citations";
import { DETECTOR_VERSION, type EntityMatcher } from "./detector";
import type { NormalizedResult, ProviderAnswer } from "./types";

const ANSWER_TEXT_LIMIT = 20_000;

export function normalizeProviderAnswer(
  answer: ProviderAnswer,
  customer: EntityMatcher,
  competitors: EntityMatcher[],
): NormalizedResult {
  if (!answer.ok) {
    return {
      status: "not_measured",
      errorCode: answer.errorCode,
      errorMessage: answer.errorMessage.slice(0, 500),
      groundingMode: null,
      model: answer.model,
      mentioned: null,
      position: null,
      citedUrls: [],
      citedDomains: [],
      namedBusinesses: [],
      competitorIdsMentioned: [],
      matchEvidence: null,
      detectorVersion: null,
      answerText: null,
      latencyMs: answer.latencyMs,
    };
  }

  const { urls, domains } = mergeCitations(answer.nativeCitationUrls, extractUrlsFromText(answer.answerText));
  const named = answer.namedBusinesses.map((b) => b.trim()).filter((b) => b.length > 0).slice(0, 25);
  const input = { answerText: answer.answerText, namedBusinesses: named, citedDomains: domains };

  const customerMatch = customer.match(input);
  const idx = named.findIndex((b) => customer.matchName(b));
  const position = idx >= 0 ? idx + 1 : null;

  const competitorIdsMentioned = competitors.filter((c) => c.match(input).matched).map((c) => c.entity.id);

  return {
    status: "measured",
    errorCode: null,
    errorMessage: null,
    groundingMode: answer.groundingMode,
    model: answer.model,
    mentioned: customerMatch.matched,
    position,
    citedUrls: urls,
    citedDomains: domains,
    namedBusinesses: named,
    competitorIdsMentioned,
    matchEvidence: { matchedBy: customerMatch.matchedBy, matchedText: customerMatch.matchedText },
    detectorVersion: DETECTOR_VERSION,
    answerText: answer.answerText.slice(0, ANSWER_TEXT_LIMIT),
    latencyMs: answer.latencyMs,
  };
}
