/* eslint-disable no-console */
/**
 * Observation execution orchestrator — the single entry point the
 * audit-intelligence pipeline calls AFTER the deterministic score
 * has been persisted.
 *
 * Composes the five pieces in the correct order with fail-soft
 * semantics + module-level counters:
 *
 *   1. isObservationEnabled() gate         → flag_disabled
 *   2. executeObservation()                → no_providers_enabled when no keys
 *   3. buildObservationSummary()
 *   4. validateObservation()
 *   5. runObservationGuarded(score, ...)   → typed barrier
 *   6. writeObservationHistory()           → append-only
 *
 * The orchestrator NEVER throws. Every failure mode becomes a typed
 * `RunObservationExecutionOutcome`. Audit completion is therefore
 * unaffected by observation-layer state.
 */

import { Prisma, PrismaClient } from "@prisma/client";

import type { DeterministicScore } from "@/lib/scoring/types";

import { executeObservation } from "./executeObservation";
import {
  ObservationMutationError,
  runObservationGuarded,
} from "./guards/confidenceGate";
import { validateObservation } from "./guards/validateObservation";
import {
  buildObservationHistoryRow,
  writeObservationHistory,
} from "./history/observation-history";
import { isObservationEnabled } from "./index";
import { buildObservationSummary } from "./storage/observation-summary";
import type { ObservationStatus } from "./types";

export type RunObservationExecutionOutcome =
  | { ran: false; reason: "flag_disabled" }
  | { ran: false; reason: "no_providers_enabled"; latencyMs: number }
  | {
      ran: true;
      outcome: "succeeded";
      historyId: string;
      latencyMs: number;
      observationStatus: ObservationStatus;
    }
  | {
      ran: true;
      outcome: "failed_guard";
      mutatedFields: string[];
      latencyMs: number;
    }
  | {
      ran: true;
      outcome: "failed";
      error: string;
      latencyMs: number;
    };

export type ObservationCounters = {
  skipped_disabled: number;
  skipped_no_keys: number;
  succeeded: number;
  failed: number;
  failed_guard: number;
};

const OBSERVATION_COUNTERS: ObservationCounters = {
  skipped_disabled: 0,
  skipped_no_keys: 0,
  succeeded: 0,
  failed: 0,
  failed_guard: 0,
};

export function getObservationCounters(): ObservationCounters {
  return { ...OBSERVATION_COUNTERS };
}

export function resetObservationCounters(): void {
  OBSERVATION_COUNTERS.skipped_disabled = 0;
  OBSERVATION_COUNTERS.skipped_no_keys = 0;
  OBSERVATION_COUNTERS.succeeded = 0;
  OBSERVATION_COUNTERS.failed = 0;
  OBSERVATION_COUNTERS.failed_guard = 0;
}

export async function runObservationExecution(args: {
  prisma: PrismaClient | Prisma.TransactionClient;
  auditId: string;
  businessName: string | null;
  websiteUrl: string;
  deterministicScore: DeterministicScore;
}): Promise<RunObservationExecutionOutcome> {
  const { prisma, auditId, businessName, websiteUrl, deterministicScore } =
    args;

  // 1. Flag gate — early return preserves byte-equal behavior when
  // ENABLE_OBSERVATION is not "true".
  if (!isObservationEnabled()) {
    OBSERVATION_COUNTERS.skipped_disabled += 1;
    console.log(
      `[observation] orderId=${auditId} outcome=skipped reason=flag_disabled`,
    );
    return { ran: false, reason: "flag_disabled" };
  }

  const startedAt = Date.now();

  try {
    const innerOutcome = await runObservationGuarded(
      deterministicScore,
      async () => {
        const result = await executeObservation({
          businessName: businessName ?? "",
          websiteUrl,
        });

        if (result.skipped_reason === "no_providers_enabled") {
          return { kind: "no_keys" as const };
        }

        const summary = buildObservationSummary({ result });
        const health = validateObservation(summary);
        const row = buildObservationHistoryRow({ auditId, summary, health });
        const { id } = await writeObservationHistory({ prisma, row });

        return {
          kind: "wrote" as const,
          historyId: id,
          status: health.status,
          agreement: summary.agreement_score,
          providers: summary.providers_run.length,
        };
      },
    );

    const latencyMs = Date.now() - startedAt;

    if (innerOutcome.kind === "no_keys") {
      OBSERVATION_COUNTERS.skipped_no_keys += 1;
      console.log(
        `[observation] orderId=${auditId} outcome=skipped reason=no_providers_enabled latency_ms=${latencyMs}`,
      );
      return { ran: false, reason: "no_providers_enabled", latencyMs };
    }

    OBSERVATION_COUNTERS.succeeded += 1;
    console.log(
      `[observation] orderId=${auditId} outcome=succeeded status=${innerOutcome.status} providers=${innerOutcome.providers} agreement=${innerOutcome.agreement} latency_ms=${latencyMs} history_id=${innerOutcome.historyId}`,
    );
    return {
      ran: true,
      outcome: "succeeded",
      historyId: innerOutcome.historyId,
      latencyMs,
      observationStatus: innerOutcome.status,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;

    if (err instanceof ObservationMutationError) {
      OBSERVATION_COUNTERS.failed_guard += 1;
      console.warn(
        `[observation] orderId=${auditId} outcome=failed_guard mutated=${err.mutated_fields.join(",")} latency_ms=${latencyMs}`,
      );
      return {
        ran: true,
        outcome: "failed_guard",
        mutatedFields: err.mutated_fields,
        latencyMs,
      };
    }

    const msg = err instanceof Error ? err.message : String(err);
    OBSERVATION_COUNTERS.failed += 1;
    console.warn(
      `[observation] orderId=${auditId} outcome=failed error="${msg}" latency_ms=${latencyMs}`,
    );
    return { ran: true, outcome: "failed", error: msg, latencyMs };
  }
}
