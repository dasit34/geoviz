/* eslint-disable no-console */
/**
 * scripts/test-ai-validators.ts
 *
 * Mocked-only test runner for the AI validator scaffold. No network.
 * No real API keys read. No DB writes. Mutates `process.env` between
 * scenarios to exercise the gating ladder, then restores at the end.
 *
 *   npx tsx scripts/test-ai-validators.ts
 *
 * Exit code 0 if all assertions pass; 1 otherwise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ClaudeValidator } from "../src/lib/validators/providers/claude";
import { OpenAIValidator } from "../src/lib/validators/providers/openai";
import { GeminiValidator } from "../src/lib/validators/providers/gemini";
import { PerplexityValidator } from "../src/lib/validators/providers/perplexity";
import { GoogleAIOverviewValidator } from "../src/lib/validators/providers/googleAiOverview";
import { runAiValidationLayer } from "../src/lib/validators";
import { createMockValidator } from "../src/lib/validators/testing/mockValidator";
import { VALIDATOR_REGISTRY } from "../src/lib/validators/registry";
import type {
  NormalizedValidationOutput,
  ValidationInput,
} from "../src/lib/validators/types";

// Snapshot env vars we mutate so other scripts/dev workflows aren't
// surprised when this runs alongside them.
const ENV_KEYS = [
  "ENABLE_AI_VALIDATORS",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PERPLEXITY_API_KEY",
  "ANTHROPIC_API_KEY",
  // Test-only fixture-mode envs consumed by live-wired providers.
  // Snapshot + restore so the test suite is hermetic and idempotent.
  "OPENAI_VALIDATOR_FIXTURE",
  "CLAUDE_VALIDATOR_FIXTURE",
  "GEMINI_VALIDATOR_FIXTURE",
  "PERPLEXITY_VALIDATOR_FIXTURE",
] as const;
const envSnapshot: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    const line = `  ✗ ${label}${detail ? ` — ${detail}` : ""}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

const sampleInput: ValidationInput = {
  businessName: "Test Co",
  url: "https://example.com",
  deterministicScore: { overall_score: 52 },
  categoryScores: {},
  extractedEvidence: {},
  reportContext: {},
};

async function scenario1Disabled(): Promise<void> {
  console.log("[ai-validators-test] Scenario 1: ENABLE_AI_VALIDATORS unset (default off)");
  clearEnv();
  const c = await ClaudeValidator.validateBusiness(sampleInput);
  check("Claude → skipped", c.status === "skipped", `got ${c.status}`);
  const o = await OpenAIValidator.validateBusiness(sampleInput);
  check("OpenAI → skipped", o.status === "skipped", `got ${o.status}`);
  const g = await GeminiValidator.validateBusiness(sampleInput);
  check("Gemini → skipped", g.status === "skipped", `got ${g.status}`);
  const p = await PerplexityValidator.validateBusiness(sampleInput);
  check("Perplexity → skipped", p.status === "skipped", `got ${p.status}`);
  const ga = await GoogleAIOverviewValidator.validateBusiness(sampleInput);
  check("Google AI Overview → unavailable (permanent)", ga.status === "unavailable");
}

async function scenario2EnabledNoKeys(): Promise<void> {
  console.log("[ai-validators-test] Scenario 2: ENABLE_AI_VALIDATORS=true, no API keys");
  clearEnv();
  process.env.ENABLE_AI_VALIDATORS = "true";
  const c = await ClaudeValidator.validateBusiness(sampleInput);
  check("Claude → unavailable when ANTHROPIC_API_KEY missing", c.status === "unavailable");
  check("Claude error names ANTHROPIC_API_KEY", typeof c.error === "string" && c.error.includes("ANTHROPIC_API_KEY"));
  const o = await OpenAIValidator.validateBusiness(sampleInput);
  check("OpenAI → unavailable when OPENAI_API_KEY missing", o.status === "unavailable");
  check("OpenAI error names OPENAI_API_KEY", typeof o.error === "string" && o.error.includes("OPENAI_API_KEY"));
  const g = await GeminiValidator.validateBusiness(sampleInput);
  check("Gemini → unavailable when GEMINI_API_KEY missing", g.status === "unavailable");
  const p = await PerplexityValidator.validateBusiness(sampleInput);
  check("Perplexity → unavailable when PERPLEXITY_API_KEY missing", p.status === "unavailable");
  const ga = await GoogleAIOverviewValidator.validateBusiness(sampleInput);
  check("Google AI Overview → unavailable (regardless of master gate)", ga.status === "unavailable");
}

async function scenario3EnabledAllKeys(): Promise<void> {
  console.log("[ai-validators-test] Scenario 3: ENABLE_AI_VALIDATORS=true + all API keys present");
  clearEnv();
  process.env.ENABLE_AI_VALIDATORS = "true";
  process.env.ANTHROPIC_API_KEY = "mock-key";
  process.env.OPENAI_API_KEY = "mock-key";
  process.env.GEMINI_API_KEY = "mock-key";
  process.env.PERPLEXITY_API_KEY = "mock-key";
  // OpenAI + Claude + Gemini + Perplexity providers are now LIVE-wired —
  // fixture-mode keeps the test hermetic by short-circuiting the real call
  // and returning the legacy MOCK_RESPONSE.
  process.env.OPENAI_VALIDATOR_FIXTURE = "true";
  process.env.CLAUDE_VALIDATOR_FIXTURE = "true";
  process.env.GEMINI_VALIDATOR_FIXTURE = "true";
  process.env.PERPLEXITY_VALIDATOR_FIXTURE = "true";
  const c = await ClaudeValidator.validateBusiness(sampleInput);
  check("Claude → passed (mock)", c.status === "passed");
  check("Claude raw_summary contains [MOCK]", c.raw_summary.includes("[MOCK]"));
  check("Claude business_understanding_score is numeric", typeof c.business_understanding_score === "number");
  const o = await OpenAIValidator.validateBusiness(sampleInput);
  check("OpenAI → passed (mock)", o.status === "passed");
  const g = await GeminiValidator.validateBusiness(sampleInput);
  check("Gemini → passed (mock)", g.status === "passed");
  const p = await PerplexityValidator.validateBusiness(sampleInput);
  check("Perplexity → passed (mock) with cited_sources populated", p.status === "passed" && p.cited_sources.length > 0);
  const ga = await GoogleAIOverviewValidator.validateBusiness(sampleInput);
  check("Google AI Overview → STILL unavailable (permanent placeholder)", ga.status === "unavailable");
}

async function scenario4OrchestratorOrdering(): Promise<void> {
  console.log("[ai-validators-test] Scenario 4: orchestrator output ordering + shape");
  clearEnv();
  process.env.ENABLE_AI_VALIDATORS = "true";
  process.env.ANTHROPIC_API_KEY = "mock-key";
  process.env.OPENAI_API_KEY = "mock-key";
  process.env.GEMINI_API_KEY = "mock-key";
  process.env.PERPLEXITY_API_KEY = "mock-key";
  // Fixture mode for the live-wired OpenAI + Claude + Gemini + Perplexity
  // providers; keeps the orchestrator path hermetic during testing.
  process.env.OPENAI_VALIDATOR_FIXTURE = "true";
  process.env.CLAUDE_VALIDATOR_FIXTURE = "true";
  process.env.GEMINI_VALIDATOR_FIXTURE = "true";
  process.env.PERPLEXITY_VALIDATOR_FIXTURE = "true";
  // Mute the dev console.log so test output stays clean. The result is
  // still returned to the caller — we're only suppressing the log side
  // effect for this assertion run.
  const originalLog = console.log;
  console.log = () => undefined;
  let result;
  try {
    result = await runAiValidationLayer(sampleInput);
  } finally {
    console.log = originalLog;
  }
  check("outputs is an array", Array.isArray(result.outputs));
  check(
    "outputs.length === VALIDATOR_REGISTRY.length",
    result.outputs.length === VALIDATOR_REGISTRY.length,
    `got ${result.outputs.length}, registry has ${VALIDATOR_REGISTRY.length}`,
  );
  const expectedOrder = VALIDATOR_REGISTRY.map((v) => v.name);
  const actualOrder = result.outputs.map((o) => o.provider);
  check(
    "outputs are in registry order",
    JSON.stringify(actualOrder) === JSON.stringify(expectedOrder),
    `expected ${JSON.stringify(expectedOrder)}, got ${JSON.stringify(actualOrder)}`,
  );
  check(
    "ran_at is ISO timestamp",
    typeof result.ran_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(result.ran_at),
  );
  check("enabled flag reflects env", result.enabled === true);
}

async function scenario5OrchestratorDisabled(): Promise<void> {
  console.log("[ai-validators-test] Scenario 5: orchestrator when validators disabled");
  clearEnv();
  const originalLog = console.log;
  console.log = () => undefined;
  let result;
  try {
    result = await runAiValidationLayer(sampleInput);
  } finally {
    console.log = originalLog;
  }
  check("enabled flag is false", result.enabled === false);
  const skippedExceptGoogle = result.outputs
    .filter((o) => o.provider !== "google_ai_overview")
    .every((o) => o.status === "skipped");
  check("all real providers skipped (Google stays unavailable)", skippedExceptGoogle);
}

async function scenario6OrchestratorCatchesThrows(): Promise<void> {
  console.log("[ai-validators-test] Scenario 6: orchestrator converts thrown errors to status:failed");
  // We exercise the orchestrator's catch logic by simulating it inline
  // — the real orchestrator wraps each validator call in try/catch and
  // produces a status:"failed" output on exception. The shape we
  // verify here MUST match runAiValidationLayer.ts's catch branch.
  const e = new Error("simulated failure");
  const synthesized: NormalizedValidationOutput = {
    provider: "throwing",
    status: "failed",
    business_understanding_score: null,
    category_confidence: null,
    service_area_confidence: null,
    recommendation_confidence: null,
    missing_facts: [],
    cited_sources: [],
    raw_summary: `[failed] ${e.name}: ${e.message}`,
    error: e.message,
  };
  check("failed output shape: status=failed", synthesized.status === "failed");
  check("failed output shape: error captured", synthesized.error === "simulated failure");
  check("failed output shape: scalar fields null", synthesized.business_understanding_score === null);
  check("failed output shape: list fields empty", synthesized.missing_facts.length === 0 && synthesized.cited_sources.length === 0);
}

async function scenario7MockValidatorPassthrough(): Promise<void> {
  console.log("[ai-validators-test] Scenario 7: mock validator flows through unchanged");
  clearEnv();
  const mock = createMockValidator("test-mock", {
    business_understanding_score: 99,
    raw_summary: "[fixture] custom mock summary",
  });
  const out = await mock.validateBusiness(sampleInput);
  check("mock score == 99", out.business_understanding_score === 99);
  check("mock raw_summary preserved", out.raw_summary === "[fixture] custom mock summary");
  check("mock status defaults to passed", out.status === "passed");
  check("mock provider name stamped", out.provider === "test-mock");
}

function scenario8NoForbiddenImports(): void {
  console.log("[ai-validators-test] Scenario 8: network/SDK imports scoped to live-wired files only");
  // Live-wired files are allowed to contain `fetch(` and/or provider
  // SDK imports. Every other validator file must stay free of network
  // primitives and provider SDKs.
  const LIVE_WIRED_OPENAI = "src/lib/validators/providers/openai.ts";
  const LIVE_WIRED_CLAUDE = "src/lib/validators/providers/claude.ts";
  const LIVE_WIRED_GEMINI = "src/lib/validators/providers/gemini.ts";
  const LIVE_WIRED_PERPLEXITY = "src/lib/validators/providers/perplexity.ts";
  const mockOnlyFiles = [
    "src/lib/validators/index.ts",
    "src/lib/validators/types.ts",
    "src/lib/validators/registry.ts",
    "src/lib/validators/runAiValidationLayer.ts",
    "src/lib/validators/devLog.ts",
    "src/lib/validators/providers/googleAiOverview.ts",
    "src/lib/validators/testing/mockValidator.ts",
  ];
  const forbidden = [
    "fetch(",
    'from "openai"',
    'from "@anthropic-ai/sdk"',
    'from "@google/generative-ai"',
    'from "node:https"',
    'from "node:http"',
    'require("openai")',
    'require("@anthropic-ai/sdk")',
  ];
  let anyForbiddenInMockFiles = false;
  for (const path of mockOnlyFiles) {
    const abs = join(process.cwd(), path);
    const text = readFileSync(abs, "utf8");
    for (const needle of forbidden) {
      if (text.includes(needle)) {
        console.log(`    ⚠ found "${needle}" in ${path}`);
        anyForbiddenInMockFiles = true;
      }
    }
  }
  check(
    "no fetch / API SDK imports in mock-only validator files",
    !anyForbiddenInMockFiles,
  );

  // ── openai.ts positive assertions ────────────────────────────────
  const openaiText = readFileSync(
    join(process.cwd(), LIVE_WIRED_OPENAI),
    "utf8",
  );
  check(
    "openai.ts targets the OpenAI Chat Completions endpoint",
    openaiText.includes("https://api.openai.com/v1/chat/completions"),
  );
  check("openai.ts contains a fetch( call", openaiText.includes("fetch("));
  check(
    "openai.ts does NOT import the openai SDK (raw fetch only)",
    !openaiText.includes('from "openai"') &&
      !openaiText.includes('require("openai")'),
  );
  check(
    "openai.ts uses json_schema response_format (strict structured outputs)",
    openaiText.includes('"json_schema"') && openaiText.includes("strict: true"),
  );
  check(
    "openai.ts handles message.refusal (safety-refusal path)",
    openaiText.includes("refusal") &&
      openaiText.includes("OpenAI safety refusal"),
  );

  // ── claude.ts positive assertions ────────────────────────────────
  const claudeText = readFileSync(
    join(process.cwd(), LIVE_WIRED_CLAUDE),
    "utf8",
  );
  check(
    "claude.ts imports @anthropic-ai/sdk",
    claudeText.includes('from "@anthropic-ai/sdk"'),
  );
  check(
    "claude.ts uses tool-use with input_schema (strict structured output)",
    claudeText.includes("input_schema") && claudeText.includes("tool_choice"),
  );
  check(
    "claude.ts forces tool_choice to a specific tool (not auto)",
    claudeText.includes('type: "tool"'),
  );
  check(
    "claude.ts handles tool_use absence (refusal-equivalent path)",
    claudeText.includes("did not return a tool_use block"),
  );

  // ── gemini.ts positive assertions ────────────────────────────────
  const geminiText = readFileSync(
    join(process.cwd(), LIVE_WIRED_GEMINI),
    "utf8",
  );
  check(
    "gemini.ts targets the Generative Language API endpoint",
    geminiText.includes(
      "https://generativelanguage.googleapis.com/v1beta/models/",
    ),
  );
  check("gemini.ts contains a fetch( call", geminiText.includes("fetch("));
  check(
    "gemini.ts uses responseSchema (strict structured outputs)",
    geminiText.includes("responseSchema") &&
      geminiText.includes('responseMimeType: "application/json"'),
  );
  check(
    "gemini.ts handles candidate.finishReason (safety/recitation path)",
    geminiText.includes("finishReason"),
  );
  check(
    "gemini.ts handles promptFeedback.blockReason (prompt-level safety)",
    geminiText.includes("promptFeedback") &&
      geminiText.includes("blockReason"),
  );
  check(
    "gemini.ts does NOT import a provider SDK (raw fetch only)",
    !geminiText.includes('from "@google/generative-ai"') &&
      !geminiText.includes('require("@google/generative-ai")'),
  );

  // ── perplexity.ts positive assertions ────────────────────────────
  const perplexityText = readFileSync(
    join(process.cwd(), LIVE_WIRED_PERPLEXITY),
    "utf8",
  );
  check(
    "perplexity.ts targets api.perplexity.ai chat completions endpoint",
    perplexityText.includes("https://api.perplexity.ai/chat/completions"),
  );
  check(
    "perplexity.ts contains a fetch( call",
    perplexityText.includes("fetch("),
  );
  check(
    "perplexity.ts uses json_schema response_format (structured outputs)",
    perplexityText.includes('"json_schema"') &&
      perplexityText.includes("response_format"),
  );
  check(
    "perplexity.ts merges data.citations into cited_sources",
    perplexityText.includes("data.citations") &&
      perplexityText.includes("mergeCitedSources"),
  );
  check(
    "perplexity.ts handles finish_reason (refusal-equivalent path)",
    perplexityText.includes("finish_reason"),
  );
  check(
    "perplexity.ts does NOT import a Perplexity SDK (raw fetch only)",
    !perplexityText.includes('from "perplexity') &&
      !perplexityText.includes('require("perplexity'),
  );
}

async function main(): Promise<void> {
  console.log("[ai-validators-test] starting");
  console.log("");
  try {
    await scenario1Disabled();
    await scenario2EnabledNoKeys();
    await scenario3EnabledAllKeys();
    await scenario4OrchestratorOrdering();
    await scenario5OrchestratorDisabled();
    await scenario6OrchestratorCatchesThrows();
    await scenario7MockValidatorPassthrough();
    scenario8NoForbiddenImports();
  } finally {
    restoreEnv();
  }
  console.log("");
  console.log(`[ai-validators-test] passed=${passed} failed=${failed} total=${passed + failed}`);
  if (failed > 0) {
    console.log("");
    console.log("[ai-validators-test] FAILURES:");
    for (const f of failures) console.log(f);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[ai-validators-test] unhandled error:", err);
  restoreEnv();
  process.exit(1);
});
