/* eslint-disable no-console */
/**
 * scripts/test-live-validators.ts
 *
 * Operator-driven manual verification — runs every validator in
 * `VALIDATOR_REGISTRY` in PARALLEL against one hard-coded sample
 * business and prints normalized output per provider.
 *
 * Caller must export the per-provider API keys BEFORE invoking. This
 * script does NOT read `.env`. Each provider self-skips with
 * `status: "unavailable"` when its key is missing.
 *
 * Read-only:
 *   - no DB connection / no Prisma import
 *   - no file writes (everything prints to stdout)
 *   - no imports from scoring / audit-intelligence
 *   - no env-var values logged (only presence + length)
 *
 * Usage:
 *   ANTHROPIC_API_KEY="..." \
 *   OPENAI_API_KEY="..." \
 *   GEMINI_API_KEY="..." \
 *   PERPLEXITY_API_KEY="..." \
 *   npx tsx scripts/test-live-validators.ts
 *
 * Exit code: always 0 (debugging tool, not CI gate). Per-provider
 * outcomes are surfaced via the `status` field and the summary line.
 */

import { VALIDATOR_REGISTRY } from "../src/lib/validators/registry";
import type {
  NormalizedValidationOutput,
  ValidationInput,
} from "../src/lib/validators/types";

const SAMPLE_INPUT: ValidationInput = {
  businessName: "Rock Roofing Ohio",
  url: "https://rockroofingohio.com",
  deterministicScore: { overall_score: 52, band: "Needs Work" },
  categoryScores: {
    schema: 13,
    crawler: 14,
    trust: 8,
    content: 7,
    brand: 5,
    tech: 5,
  },
  extractedEvidence: {
    word_count: 412,
    has_faq_schema: false,
    schema_types: ["LocalBusiness"],
  },
  reportContext: { industry: "roofing" },
};

type Validator = (typeof VALIDATOR_REGISTRY)[number];

type ProviderResult = {
  output: NormalizedValidationOutput;
  latency_ms: number;
};

// Rough per-call USD cost estimates for the current default model
// in each provider. These are coarse — calibrated for the prompt
// shape used by this validator layer (a few hundred input tokens,
// short JSON output). Update when models change.
//
//   openai           gpt-4.1-mini       $0.40/1M in, $1.60/1M out
//   claude           claude-haiku-4-5   $1/1M in, $5/1M out
//   gemini           gemini-2.5-flash   $0.30/1M in, $2.50/1M out
//   perplexity       sonar              $1/1M in, $1/1M out + $5/1k req
//   google_ai_overview                  no public API → 0
const ESTIMATED_COST_PER_CALL_USD: Record<string, number> = {
  openai: 0.0008,
  claude: 0.002,
  gemini: 0.0006,
  perplexity: 0.006,
  google_ai_overview: 0,
};

async function runOne(validator: Validator): Promise<ProviderResult> {
  const t0 = Date.now();
  try {
    const output = await validator.validateBusiness(SAMPLE_INPUT);
    return { output, latency_ms: Date.now() - t0 };
  } catch (err) {
    // Provider implementations catch internally and return
    // `status: "failed"`. This outer catch is defense-in-depth for
    // any uncaught throw — mirror the orchestrator's failure shape.
    const e = err as Error;
    return {
      output: {
        provider: validator.name,
        status: "failed",
        business_understanding_score: null,
        category_confidence: null,
        service_area_confidence: null,
        recommendation_confidence: null,
        missing_facts: [],
        cited_sources: [],
        raw_summary: `[failed] uncaught: ${e.message ?? String(err)}`,
        error: e.message ?? String(err),
      },
      latency_ms: Date.now() - t0,
    };
  }
}

function fmtOutput(o: NormalizedValidationOutput, latencyMs: number): string {
  const lines: string[] = [];
  lines.push("──────────────────────────────────────────────────────────────");
  lines.push(`provider:                       ${o.provider}`);
  lines.push(`status:                         ${o.status}`);
  lines.push(`latency_ms:                     ${latencyMs}`);
  lines.push(
    `business_understanding_score:   ${
      o.business_understanding_score === null
        ? "null"
        : String(o.business_understanding_score)
    }`,
  );
  lines.push(
    `category_confidence:            ${o.category_confidence ?? "null"}`,
  );
  lines.push(
    `service_area_confidence:        ${o.service_area_confidence ?? "null"}`,
  );
  lines.push(
    `recommendation_confidence:      ${o.recommendation_confidence ?? "null"}`,
  );
  if (o.missing_facts.length === 0) {
    lines.push(`missing_facts:                  (empty)`);
  } else {
    lines.push(`missing_facts:`);
    for (const f of o.missing_facts) lines.push(`  - ${f}`);
  }
  if (o.cited_sources.length === 0) {
    lines.push(`cited_sources:                  (empty)`);
  } else {
    lines.push(`cited_sources:`);
    for (const s of o.cited_sources) lines.push(`  - ${s}`);
  }
  lines.push(`raw_summary:                    ${o.raw_summary}`);
  lines.push(`error:                          ${o.error ?? "null"}`);
  return lines.join("\n");
}

function envPresenceLine(): string {
  // Presence + length only — never log the value itself.
  const parts: string[] = [];
  for (const key of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "PERPLEXITY_API_KEY",
  ]) {
    const v = process.env[key];
    parts.push(
      `${key}=${typeof v === "string" && v.length > 0 ? `present(len=${v.length})` : "(unset)"}`,
    );
  }
  return parts.join(", ");
}

async function main(): Promise<void> {
  console.log("[test-live-validators] starting");
  console.log(
    `[test-live-validators] sample: ${SAMPLE_INPUT.businessName} <${SAMPLE_INPUT.url}>`,
  );
  console.log(`[test-live-validators] env: ${envPresenceLine()}`);
  console.log("");

  const t0 = Date.now();
  const results = await Promise.all(
    VALIDATOR_REGISTRY.map((validator) => runOne(validator)),
  );
  const totalMs = Date.now() - t0;

  for (const r of results) {
    console.log(fmtOutput(r.output, r.latency_ms));
  }
  console.log("──────────────────────────────────────────────────────────────");
  console.log("");

  const counts: Record<string, number> = {
    passed: 0,
    unavailable: 0,
    skipped: 0,
    failed: 0,
  };
  for (const r of results) {
    counts[r.output.status] = (counts[r.output.status] ?? 0) + 1;
  }
  console.log(
    `Summary: passed=${counts.passed}, unavailable=${counts.unavailable}, skipped=${counts.skipped}, failed=${counts.failed} (wall-clock ${totalMs}ms across ${results.length} providers in parallel)`,
  );

  // Estimated USD cost for this run — sums per-call estimates over
  // providers that actually ran (status="passed"). Unavailable /
  // skipped / failed providers cost nothing.
  let totalCostUsd = 0;
  const costLines: string[] = [];
  for (const r of results) {
    if (r.output.status !== "passed") continue;
    const cost = ESTIMATED_COST_PER_CALL_USD[r.output.provider] ?? 0;
    totalCostUsd += cost;
    costLines.push(`  ${r.output.provider.padEnd(20)} $${cost.toFixed(4)}`);
  }
  if (costLines.length > 0) {
    console.log("");
    console.log("Estimated cost (passed providers only):");
    for (const line of costLines) console.log(line);
    console.log(`  ${"total".padEnd(20)} $${totalCostUsd.toFixed(4)}`);
  }

  process.exit(0);
}

main().catch((err) => {
  // Defense-in-depth: surfaces unexpected throws without leaking env.
  // eslint-disable-next-line no-console
  console.error("[test-live-validators] fatal:", (err as Error).message ?? err);
  process.exit(1);
});
