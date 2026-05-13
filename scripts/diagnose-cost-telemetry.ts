/* eslint-disable no-console */
/**
 * scripts/diagnose-cost-telemetry.ts
 *
 * Standalone diagnostic — exercises the cost-telemetry extraction
 * path against a SYNTHESIZED Anthropic response. No DB write, no API
 * call. Pure logic check.
 *
 *   npx tsx scripts/diagnose-cost-telemetry.ts
 *
 * If the output below shows populated `extracted-usage` + populated
 * `DB write payload` + a sensible cost number, the code path is
 * correct and any production telemetry failure is environmental
 * (Prisma client not regenerated on Railway, migration not applied,
 * or worker accidentally running in CLI mode).
 *
 * If the output shows null fields here, the bug is in the extraction
 * code itself.
 *
 * Uses the `[geo-cost-debug]` prefix so the operator can compare
 * side-by-side with real Railway log lines.
 *
 * Remove this script + the `[geo-cost-debug]` lines in the worker
 * once the root cause is identified.
 */

import {
  estimateAuditCostUsd,
  formatUsageLog,
  type TokenUsage,
} from "../src/lib/pricing";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const FAKE_ORDER_ID = "diag_abc123def456ghi789jklmn";

function log(line: string): void {
  console.log(line);
}

function main(): void {
  log(
    `[geo-cost-debug] worker boot — telemetry instrumentation v1 active · auditMode=api model=${MODEL} maxTokens=8000`,
  );

  // ---- Step 1 — synthesize the SDK response shape we expect.
  // Mirrors what the Anthropic SDK's `messages.create` returns for a
  // typical Sonnet call with web_search tool round-trips. The key
  // names match the SDK type definitions (snake_case at this layer).
  const fakeResponse = {
    id: "msg_diag01H2BRR8MXR5N5XR4XRZG9PMHA",
    type: "message",
    role: "assistant",
    model: MODEL,
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: "## 1. AI Visibility Score\n…(synthesized markdown body)…",
      },
    ],
    usage: {
      input_tokens: 4128,
      output_tokens: 5021,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };

  log(
    `[geo-cost-debug] runApi sdk-response stopReason=${fakeResponse.stop_reason} contentBlocks=${fakeResponse.content.length} hasUsage=${fakeResponse.usage !== null && fakeResponse.usage !== undefined} usageJson=${JSON.stringify(fakeResponse.usage ?? null)}`,
  );

  // ---- Step 2 — exercise the EXACT extraction code from `runApi`.
  // Any divergence here from `scripts/geo-worker.ts` voids the
  // diagnostic; keep these blocks in sync until the diagnostic is
  // removed.
  const rawUsage = fakeResponse.usage as
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      }
    | undefined
    | null;
  const usage: TokenUsage = {
    inputTokens: rawUsage?.input_tokens ?? null,
    outputTokens: rawUsage?.output_tokens ?? null,
    cacheCreationTokens: rawUsage?.cache_creation_input_tokens ?? null,
    cacheReadTokens: rawUsage?.cache_read_input_tokens ?? null,
  };

  log(
    `[geo-cost-debug] runApi extracted-usage ${JSON.stringify(usage)} modelUsed=${MODEL}`,
  );
  log(`[geo-worker] api usage ${formatUsageLog(MODEL, usage)}`);

  // ---- Step 3 — simulate the WrapperResult return.
  const result = {
    ok: true as const,
    markdown: "synthesized markdown",
    exitCode: 0,
    stderr: "",
    elapsedMs: 42_000,
    usage,
    modelUsed: MODEL,
  };

  log(
    `[geo-cost-debug] processOneJob result.ok=${result.ok} elapsedMs=${result.elapsedMs} hasUsageKey=${"usage" in result} usageTruthy=${"usage" in result && Boolean(result.usage)} hasModelKey=${"modelUsed" in result} modelUsedVal=${"modelUsed" in result ? String(result.modelUsed) : "absent"}`,
  );

  // ---- Step 4 — exercise the success-path usageData build.
  const usageData =
    "usage" in result && result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheCreationTokens: result.usage.cacheCreationTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          modelUsed: result.modelUsed ?? MODEL,
          estimatedCostUsd: estimateAuditCostUsd(
            result.modelUsed ?? MODEL,
            result.usage,
          ),
          workerRuntimeMs: result.elapsedMs,
        }
      : { workerRuntimeMs: result.elapsedMs };

  log(
    `[geo-cost-debug] DB write payload orderId=${FAKE_ORDER_ID} keys=${Object.keys(usageData).join(",")} payloadJson=${JSON.stringify(usageData)}`,
  );

  // ---- Step 5 — simulate the post-write echo (what the worker
  // would log after `prisma.auditOrder.update` returns).
  const synthesizedSaved = {
    inputTokens: "inputTokens" in usageData ? usageData.inputTokens : null,
    outputTokens: "outputTokens" in usageData ? usageData.outputTokens : null,
    modelUsed: "modelUsed" in usageData ? usageData.modelUsed : null,
    estimatedCostUsd:
      "estimatedCostUsd" in usageData ? usageData.estimatedCostUsd : null,
    workerRuntimeMs: usageData.workerRuntimeMs,
  };
  log(
    `[geo-cost-debug] DB write success orderId=${FAKE_ORDER_ID} dbInputTokens=${synthesizedSaved.inputTokens ?? "null"} dbOutputTokens=${synthesizedSaved.outputTokens ?? "null"} dbModelUsed=${synthesizedSaved.modelUsed ?? "null"} dbEstimatedCostUsd=${synthesizedSaved.estimatedCostUsd?.toString() ?? "null"} dbWorkerRuntimeMs=${synthesizedSaved.workerRuntimeMs ?? "null"}`,
  );

  // ---- Step 6 — simulate the operator-facing `[geo-cost]` line.
  const modelForLog = result.modelUsed ?? MODEL;
  const costForLog = estimateAuditCostUsd(modelForLog, result.usage);
  log(
    `[geo-cost] auditId=${FAKE_ORDER_ID} model=${modelForLog} input=${result.usage.inputTokens ?? 0} output=${result.usage.outputTokens ?? 0} cost=$${costForLog.toFixed(4)} runtime=${result.elapsedMs}ms url=https://diag.example.com status=generated retries=0`,
  );

  console.log("\n────────────────────────────────────────────────────────");
  console.log("Diagnostic complete — what to compare against Railway logs:");
  console.log("");
  console.log("  • If all `[geo-cost-debug]` lines above show populated");
  console.log("    fields but Railway logs do NOT, the worker either");
  console.log("    isn't running this build OR is going through CLI mode.");
  console.log("");
  console.log("  • If Railway shows `runApi sdk-response` with");
  console.log("    `usageJson=null`, the Anthropic SDK isn't returning");
  console.log("    usage on the production call. Investigation: SDK");
  console.log("    version, model permissions, tool-use accounting.");
  console.log("");
  console.log("  • If Railway shows populated `payloadJson` but the");
  console.log("    `DB write success` line has NULL for the new columns,");
  console.log("    the Prisma client on Railway doesn't know about the");
  console.log("    new columns OR the migration is not applied. Run:");
  console.log("       npx prisma migrate status");
  console.log("       npx prisma generate");
  console.log("    on the Railway side.");
  console.log("────────────────────────────────────────────────────────\n");
}

main();
