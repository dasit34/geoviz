/**
 * Validator registry — declarative list of providers the orchestrator
 * iterates. Order here is the order in which `runAiValidationLayer`
 * returns outputs.
 *
 * Internal — not exported from `@/lib/validators` index. Imported by
 * the orchestrator and (for ordering assertions) by the test runner.
 */

import { ClaudeValidator } from "./providers/claude";
import { OpenAIValidator } from "./providers/openai";
import { GeminiValidator } from "./providers/gemini";
import { PerplexityValidator } from "./providers/perplexity";
import { GoogleAIOverviewValidator } from "./providers/googleAiOverview";
import type { AiValidator } from "./types";

export const VALIDATOR_REGISTRY: readonly AiValidator[] = [
  ClaudeValidator,
  OpenAIValidator,
  GeminiValidator,
  PerplexityValidator,
  GoogleAIOverviewValidator,
];
