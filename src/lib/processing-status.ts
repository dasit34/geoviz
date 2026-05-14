/**
 * GeoViz processing-status taxonomy + classifiers.
 *
 * This module defines the **two-axis state model** that separates
 * operational/infrastructure state from audit-result classification:
 *
 *   1. PROCESSING STATUS (this module)
 *      Where in the workflow is this row? Is it queued, running,
 *      retrying after a transient failure, completed, or in a
 *      specific terminal failure state? This is infrastructure.
 *
 *   2. AUDIT RESULT (computed elsewhere, see `parse-report.ts`)
 *      What's the audit's verdict? Weak / Needs Improvement /
 *      Strong / Excellent visibility. This is the customer-facing
 *      outcome and only meaningful when processing status is
 *      COMPLETED.
 *
 * Why the split: the operator was previously seeing "FAILED" for
 * both "the audit ran and returned a low score" and "the worker
 * timed out and we have no data" — totally different operational
 * meanings. Now infrastructure failures carry a `failureReason` code
 * and a derived label (TIMEOUT / FETCH_FAILED / GENERATION_FAILED /
 * etc.), so the admin queue can show what actually happened without
 * the operator opening the report markdown.
 *
 * Storage model (intentionally minimal):
 *   - Legacy `AuditOrder.reportStatus` column stays as the canonical
 *     state machine ("pending" | "queued" | "running" | "generated"
 *     | "failed"). Backwards compatible with every existing query.
 *   - New `failureReason` column (nullable) carries the granular
 *     reason ONLY when reportStatus = "failed".
 *   - New `retryCount` column (default 0) tracks transient-failure
 *     retries. Bounded by MAX_AUTO_RETRIES.
 *   - New `lastRetryAt` column timestamps the most recent retry.
 *
 * Nothing in this module reaches into Prisma, Next.js, or any
 * customer surface. It's pure types + pure functions, importable
 * from the worker AND from React server components without
 * dependency cycles.
 */

// ────────────────────────────────────────────────────────────
// Operator-facing processing status labels
// ────────────────────────────────────────────────────────────

export type ProcessingStatusLabel =
  // Operational flow
  | "QUEUED"
  | "RUNNING"
  | "RETRYING"
  | "COMPLETED"
  // Specific terminal failure categories
  | "TIMEOUT"
  | "FETCH_FAILED"
  | "GENERATION_FAILED"
  | "SPENDING_CAP_REACHED"
  | "TEMPORARY_PROVIDER_OUTAGE"
  | "ROBOTS_BLOCKED"
  | "INVALID_HTML"
  | "RENDER_FAILED"
  | "QUEUE_INTERRUPTION"
  | "DB_SAVE_FAILED"
  | "SPAWN_FAILED"
  | "EMPTY_OUTPUT"
  | "WORKER_EXCEPTION"
  | "CANCELLED"
  // Catchall when failureReason is null/unknown
  | "FAILED";

// ────────────────────────────────────────────────────────────
// Persisted failure reason codes (one of these values lives in
// `AuditOrder.failureReason` whenever the row is in a failed state).
// String literal union so the worker can't typo a value.
// ────────────────────────────────────────────────────────────

export type FailureReason =
  | "timeout"
  | "fetch_failed"
  | "generation_failed"
  // Account-level spending cap hit (e.g. Anthropic monthly limit
  // reached). NOT retryable — retrying would never succeed until
  // the cap resets / operator raises it. Customer-facing layer
  // maps this to "delayed" (situation is recoverable, just not by
  // the worker alone).
  | "spending_cap_reached"
  // Provider returned a transient 5xx / overloaded / "service
  // unavailable" signal. Retryable — provider outages typically
  // self-recover within minutes.
  | "temporary_provider_outage"
  | "robots_blocked"
  | "invalid_html"
  | "render_failed"
  | "queue_interruption"
  | "db_save_failed"
  | "spawn_failed"
  | "empty_output"
  | "worker_exception"
  | "cancelled";

/**
 * Reasons we'll auto-retry. The retry counter is bounded by
 * `MAX_AUTO_RETRIES` per row, so even a flapping target can't trap
 * the worker in an infinite loop.
 *
 *   timeout / fetch_failed / queue_interruption — likely network or
 *     load-shedding; retrying after a backoff is the right call.
 *   render_failed — sometimes a single-attempt artifact (e.g.
 *     headless rendering blip).
 *
 * Explicitly NOT transient:
 *   generation_failed — the AI call returned non-zero with no
 *     identifiable transient signal; retrying without operator
 *     review just burns AI provider spend.
 *   db_save_failed — almost always a schema/permission issue.
 *     Retrying papers over the real problem.
 *   spawn_failed / empty_output / invalid_html / robots_blocked —
 *     deterministic for the target site; retry would yield the
 *     same outcome.
 *   worker_exception — could be a code bug; surface to operator
 *     instead of silently re-running.
 *   cancelled — operator made an explicit choice; respect it.
 */
const TRANSIENT_REASONS: ReadonlySet<FailureReason> = new Set<FailureReason>([
  "timeout",
  "fetch_failed",
  "queue_interruption",
  "render_failed",
  // Provider 5xx / overload — almost always self-recovers within
  // minutes. Retryable to give the provider a chance to clear.
  "temporary_provider_outage",
]);

export const MAX_AUTO_RETRIES = 2;

export function isTransientFailure(reason: FailureReason): boolean {
  return TRANSIENT_REASONS.has(reason);
}

export function shouldRetry(
  reason: FailureReason,
  retryCount: number,
): boolean {
  return isTransientFailure(reason) && retryCount < MAX_AUTO_RETRIES;
}

// ────────────────────────────────────────────────────────────
// Classifiers — take an error/result from a worker call site and
// return the stable failure-reason code. Centralized so the worker
// has a single place to read for "what went wrong, in one word."
// ────────────────────────────────────────────────────────────

/**
 * Classify the outcome of a wrapper call (CLI script or API call)
 * that returned `{ ok: false, reason, error }`.
 *
 *   `wrapperReason` comes from the WrapperResult type in
 *   `scripts/geo-worker.ts` (values: "timeout", "non-zero-exit",
 *   "spawn-failed", "empty-output").
 *
 *   `errorMessage` is the human-readable text used for hint matching
 *   on "non-zero-exit" outcomes (which is otherwise generic).
 */
export function classifyWrapperFailure(
  wrapperReason: string | null | undefined,
  errorMessage: string | null | undefined,
): FailureReason {
  const reason = (wrapperReason ?? "").toLowerCase();
  const msg = errorMessage ?? "";

  if (reason === "timeout") return "timeout";
  if (reason === "spawn-failed") return "spawn_failed";
  if (reason === "empty-output") return "empty_output";

  // "non-zero-exit" or unknown — inspect the error text for hints.
  //
  // Spending-cap signatures — Anthropic's 400 error explicitly names
  // the cap. Customer-facing layer projects this to "delayed" status
  // (recoverable via operator action) rather than "failed", but we
  // do NOT retry — retrying burns nothing but log noise until the
  // cap resets. See `src/lib/customer-failure-mapping.ts`.
  if (
    /specified API usage limits|spending limit|usage limit/i.test(msg) ||
    /you have reached your|regain access/i.test(msg)
  ) {
    return "spending_cap_reached";
  }
  // Provider 5xx / overload signatures — these are retryable.
  // Anthropic, OpenAI, and other LLM gateways use these phrases
  // for transient capacity issues.
  if (
    /\b5\d\d\b|service unavailable|overloaded|provider.*unavailable/i.test(
      msg,
    )
  ) {
    return "temporary_provider_outage";
  }
  if (/robots\.txt|disallowed|blocked by robots/i.test(msg)) {
    return "robots_blocked";
  }
  if (/timeout|timed out|abort/i.test(msg)) return "timeout";
  if (
    /fetch|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|connect|getaddrinfo/i.test(
      msg,
    )
  ) {
    return "fetch_failed";
  }
  if (/invalid html|parse error|html parse/i.test(msg)) return "invalid_html";
  if (/render fail|render error|headless/i.test(msg)) return "render_failed";

  return "generation_failed";
}

/**
 * Classify an unexpected JS exception caught in the worker's
 * outer catch. Most of these are unusual — we want any obvious
 * transient signal (timeout/network) to be retried; everything
 * else stays as a non-retried `worker_exception`.
 */
export function classifyWorkerException(err: unknown): FailureReason {
  const message = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out|abort/i.test(message)) return "timeout";
  if (
    /fetch|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|connect|getaddrinfo/i.test(
      message,
    )
  ) {
    return "fetch_failed";
  }
  if (/prisma|database|save failed|connection terminated/i.test(message)) {
    return "db_save_failed";
  }
  return "worker_exception";
}

// ────────────────────────────────────────────────────────────
// Display deriver — read the row's persisted state and project
// to the operator-facing label.
// ────────────────────────────────────────────────────────────

export function deriveProcessingStatus(args: {
  reportStatus: string | null | undefined;
  failureReason: string | null | undefined;
  retryCount: number | null | undefined;
}): ProcessingStatusLabel {
  const reportStatus = (args.reportStatus ?? "").toLowerCase();
  const failureReason = args.failureReason ?? null;
  const retryCount = args.retryCount ?? 0;

  if (reportStatus === "generated") return "COMPLETED";
  if (reportStatus === "running") return "RUNNING";
  if (reportStatus === "pending") return "QUEUED";
  if (reportStatus === "queued") {
    return retryCount > 0 ? "RETRYING" : "QUEUED";
  }
  if (reportStatus === "failed") {
    if (!failureReason) return "FAILED";
    return labelForReason(failureReason as FailureReason);
  }
  return "QUEUED";
}

function labelForReason(reason: FailureReason): ProcessingStatusLabel {
  switch (reason) {
    case "timeout":
      return "TIMEOUT";
    case "fetch_failed":
      return "FETCH_FAILED";
    case "generation_failed":
      return "GENERATION_FAILED";
    case "spending_cap_reached":
      return "SPENDING_CAP_REACHED";
    case "temporary_provider_outage":
      return "TEMPORARY_PROVIDER_OUTAGE";
    case "robots_blocked":
      return "ROBOTS_BLOCKED";
    case "invalid_html":
      return "INVALID_HTML";
    case "render_failed":
      return "RENDER_FAILED";
    case "queue_interruption":
      return "QUEUE_INTERRUPTION";
    case "db_save_failed":
      return "DB_SAVE_FAILED";
    case "spawn_failed":
      return "SPAWN_FAILED";
    case "empty_output":
      return "EMPTY_OUTPUT";
    case "worker_exception":
      return "WORKER_EXCEPTION";
    case "cancelled":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

/**
 * Operator-facing one-liner for a failure reason. Used in admin UI
 * tooltips + Railway logs so the meaning of each code is documented
 * in one place. NOT customer-facing.
 */
export function failureReasonDescription(reason: FailureReason): string {
  switch (reason) {
    case "timeout":
      return "Worker exceeded the configured timeout window.";
    case "fetch_failed":
      return "Could not reach the target site (network/DNS).";
    case "generation_failed":
      return "AI generation returned an error without a transient signal.";
    case "spending_cap_reached":
      return "Anthropic account spending cap hit — operator action required (raise the limit).";
    case "temporary_provider_outage":
      return "Provider returned a transient 5xx / overload signal — auto-retry scheduled.";
    case "robots_blocked":
      return "Target site blocks our crawler via robots.txt.";
    case "invalid_html":
      return "Target site returned content we couldn't parse.";
    case "render_failed":
      return "Headless render of the target page failed.";
    case "queue_interruption":
      return "Worker was interrupted while running this job.";
    case "db_save_failed":
      return "Audit succeeded but the DB write failed.";
    case "spawn_failed":
      return "Could not spawn the audit script process (CLI mode).";
    case "empty_output":
      return "Audit completed but produced no output.";
    case "worker_exception":
      return "Unexpected exception in the worker (see reportError).";
    case "cancelled":
      return "Operator cancelled this job.";
  }
}

// ────────────────────────────────────────────────────────────
// Audit-result label (the OTHER axis — outcome, not infrastructure).
// Kept in this module so operators see both axes side by side.
// ────────────────────────────────────────────────────────────

/**
 * Operator-facing audit-result classification — derived from the
 * overall score band, distinct from processing status. Only
 * meaningful when processing status is COMPLETED.
 *
 *   ≥ 81   → "Excellent Visibility"
 *   66–80  → "Strong Visibility"
 *   46–65  → "Needs Improvement"
 *    < 46  → "Weak Visibility"
 *   null   → "Pending" (audit not yet run)
 *
 * Customer-facing reports use a different label set
 * (`plainEnglishBandLabel` in parse-report.ts) — that's intentional;
 * we keep customer copy and operator copy decoupled.
 */
export function deriveAuditResultLabel(overall: number | null): string {
  if (typeof overall !== "number") return "Pending";
  if (overall >= 81) return "Excellent Visibility";
  if (overall >= 66) return "Strong Visibility";
  if (overall >= 46) return "Needs Improvement";
  return "Weak Visibility";
}
