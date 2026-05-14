/**
 * Customer-facing failure safety layer.
 *
 * Translates internal `FailureReason` codes (from `processing-status.ts`)
 * into customer-safe public categories + statuses + copy.
 *
 * Three goals:
 *
 *   1. NEVER expose raw provider / model / Prisma / stack-trace text
 *      to the customer. Every customer-visible string in this module
 *      is hand-authored, calm, and premium. The customer sees
 *      "your audit is taking longer than expected", never "Anthropic
 *      400 invalid_request_error: spending cap reached".
 *
 *   2. Map recoverable infrastructure failures (spending cap, provider
 *      outage) to "delayed" customer status — a soft, recoverable
 *      framing. Reserve "failed" for truly customer-visible dead ends.
 *
 *   3. Surface launch-risk failures to the operator separately from
 *      harmless calibration-side issues. A spending-cap hit on a paid
 *      customer order is a launch-risk; the same hit on a [CAL] run
 *      is a calibration concern, not customer-facing.
 *
 * Pure module — no I/O, no async, no Prisma. Imported by the worker,
 * the customer email sender, and the admin dashboard.
 *
 * NOT customer-facing on its own — this module's exports DRIVE
 * customer-facing surfaces but the surfaces themselves live in
 * `customer-emails.ts` and the report/admin pages.
 */

import type { FailureReason } from "./processing-status";

// ────────────────────────────────────────────────────────────
// Customer-safe failure categories (the user-facing surface). NEVER
// expose raw internal failure codes. These are stable identifiers
// the email sender + admin UI use to pick copy.
// ────────────────────────────────────────────────────────────

export type CustomerFailureCategory =
  // Provider / model returned an error (generic — never names the
  // provider, never names the model, never names the API).
  | "upstream_model_error"
  // Account spending cap hit on the AI provider. Surfaced as
  // "delayed" to the customer; recoverable via operator action.
  | "spending_cap_reached"
  // Provider 5xx / overload — typically self-recovers within
  // minutes. Surfaced as "delayed".
  | "temporary_provider_outage"
  // Target site fetch failed (network / DNS / timeout).
  | "fetch_timeout"
  // Target site explicitly blocked our crawler (robots.txt).
  | "crawler_blocked"
  // Anything else — DB / worker / unexpected exceptions. Internal.
  | "internal_processing_error"
  // Soft states (not terminal failures, but worth showing distinctly).
  | "retrying_generation"
  | "delayed_processing";

// ────────────────────────────────────────────────────────────
// Customer-facing status enum. The customer sees one of these on the
// order-status surface and in their email subject lines.
// ────────────────────────────────────────────────────────────

export type CustomerStatus =
  | "queued"
  | "processing"
  | "delayed"
  | "retrying"
  | "completed"
  | "failed";

/** Human label for each customer status — for emails + status pills. */
export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  queued: "Audit queued",
  processing: "Audit processing",
  delayed: "Audit delayed",
  retrying: "Audit retrying",
  completed: "Audit completed",
  failed: "Audit failed",
};

// ────────────────────────────────────────────────────────────
// Internal → customer-safe mapping
// ────────────────────────────────────────────────────────────

export function mapToCustomerCategory(
  reason: FailureReason,
): CustomerFailureCategory {
  switch (reason) {
    case "spending_cap_reached":
      return "spending_cap_reached";
    case "temporary_provider_outage":
      return "temporary_provider_outage";
    case "generation_failed":
      // The provider returned a non-transient error we can't classify
      // more specifically. Customer-safe framing: "upstream model".
      return "upstream_model_error";
    case "timeout":
    case "fetch_failed":
      return "fetch_timeout";
    case "robots_blocked":
      return "crawler_blocked";
    case "db_save_failed":
    case "worker_exception":
    case "invalid_html":
    case "render_failed":
    case "queue_interruption":
    case "spawn_failed":
    case "empty_output":
    case "cancelled":
      return "internal_processing_error";
  }
}

/**
 * Categories the customer should see as "delayed" (recoverable
 * infrastructure or provider problems) rather than "failed".
 * Spending cap, provider outage, and active retry all keep the
 * customer in a calm, recoverable framing.
 */
const DELAYED_CATEGORIES: ReadonlySet<CustomerFailureCategory> = new Set<CustomerFailureCategory>([
  "spending_cap_reached",
  "temporary_provider_outage",
  "retrying_generation",
  "delayed_processing",
]);

/**
 * Derive the customer-facing status from internal state. Single
 * source of truth — the report page, the admin dashboard, the
 * email sender all derive from this function.
 *
 *   - generated                                  → completed
 *   - running                                    → processing
 *   - pending                                    → queued
 *   - queued + retryCount > 0                    → retrying
 *   - queued + retryCount = 0                    → queued
 *   - failed + transient/recoverable failure     → delayed
 *   - failed + non-recoverable failure           → failed
 */
export function deriveCustomerStatus(args: {
  reportStatus: string | null | undefined;
  failureReason: FailureReason | string | null | undefined;
  retryCount: number | null | undefined;
}): CustomerStatus {
  const reportStatus = (args.reportStatus ?? "").toLowerCase();
  const retryCount = args.retryCount ?? 0;

  if (reportStatus === "generated") return "completed";
  if (reportStatus === "running") return "processing";
  if (reportStatus === "pending") return "queued";
  if (reportStatus === "queued") {
    return retryCount > 0 ? "retrying" : "queued";
  }
  if (reportStatus === "failed") {
    if (!args.failureReason) return "failed";
    const category = mapToCustomerCategory(
      args.failureReason as FailureReason,
    );
    return DELAYED_CATEGORIES.has(category) ? "delayed" : "failed";
  }
  return "queued";
}

// ────────────────────────────────────────────────────────────
// Customer-facing copy
// ────────────────────────────────────────────────────────────

export type CustomerCopy = {
  /** Short subject-line-friendly heading. */
  heading: string;
  /** Body paragraph customer reads first. */
  body: string;
  /** Closing reassurance line. */
  reassurance: string;
};

/**
 * Calm, premium, trustworthy copy per customer status. NEVER mentions:
 *   - provider names (Anthropic, OpenAI, etc.)
 *   - model names (Claude, GPT, etc.)
 *   - account/billing language (cap, limit, quota)
 *   - technical jargon (5xx, timeout, JSON, API)
 *   - blame language
 *
 * Same copy for every recoverable infrastructure issue. The customer
 * does not need (and should not see) the granular cause.
 */
export function customerCopyFor(status: CustomerStatus): CustomerCopy {
  switch (status) {
    case "queued":
      return {
        heading: "Your audit is queued",
        body: "We've received your AI Visibility Audit request and it's now in line for processing. Most audits complete within a few minutes.",
        reassurance: "You'll receive your report by email as soon as it's ready. No action is required from you.",
      };
    case "processing":
      return {
        heading: "Your audit is processing",
        body: "We're analyzing your website now. This typically takes one to two minutes.",
        reassurance: "Your report will be emailed to you the moment it's ready.",
      };
    case "delayed":
      return {
        heading: "Your audit is taking longer than expected",
        body: "Due to temporary processing volume, your AI Visibility Audit is taking a little longer than usual to complete. Your audit is still queued and we're handling it.",
        reassurance: "No action is required from you. We'll deliver your report by email as soon as processing capacity is available again.",
      };
    case "retrying":
      return {
        heading: "Your audit is being re-processed",
        body: "We encountered a brief interruption while processing your audit, and we're automatically running it again.",
        reassurance: "No action is required from you. Your report will arrive by email shortly.",
      };
    case "completed":
      return {
        heading: "Your audit is ready",
        body: "Your AI Visibility Audit has completed and your report is available now.",
        reassurance: "Open the link in your delivery email to view the full report.",
      };
    case "failed":
      return {
        heading: "We weren't able to complete your audit",
        body: "We were unable to complete your AI Visibility Audit automatically. This is rare, and the issue is on our end — not with your website.",
        reassurance: "We'll either re-run your audit at no additional cost or issue a full refund. Reply to this email and we'll respond within one business day.",
      };
  }
}

// ────────────────────────────────────────────────────────────
// Operator alerting — surface launch-risk vs. calibration-only
// ────────────────────────────────────────────────────────────

/**
 * Launch-risk failures: those that, if seen on a PAID customer order,
 * represent real customer-trust exposure. The operator dashboard
 * should surface these separately from harmless calibration failures.
 *
 *   • A spending-cap hit on a paid order = customer paid, can't get
 *     audit until operator raises the cap. Launch-risk.
 *   • A spending-cap hit on a [CAL] order = operator-side calibration
 *     concern only. Not launch-risk.
 *   • A DB-save failure on a paid order = customer paid, audit ran
 *     but didn't persist. Launch-risk.
 *   • A worker_exception on a paid order = unknown failure on a
 *     paying customer. Launch-risk.
 *   • A robots_blocked on a paid order = the site genuinely blocks
 *     crawlers, which is a fixable customer education moment, not
 *     a service-side issue. Not launch-risk.
 */
const LAUNCH_RISK_REASONS: ReadonlySet<FailureReason> = new Set<FailureReason>([
  "spending_cap_reached",
  "temporary_provider_outage", // sustained outages are launch-risk
  "generation_failed",
  "db_save_failed",
  "worker_exception",
]);

/**
 * Returns true when this failure on a paid customer order should
 * trigger an operator alert / dashboard highlight.
 *
 * Inputs:
 *   - reason: the persisted FailureReason on the row.
 *   - paymentStatus: from AuditOrder. "paid" means the customer
 *     has been charged; anything else (including calibration runs
 *     which use "paid" but with calibration@geoviz.invalid email)
 *     can be filtered by the caller using `isCalibrationOrder`.
 *   - isCalibration: convenience flag passed by the worker. When
 *     true, the failure is treated as operator-only regardless of
 *     payment status.
 */
export function isLaunchRiskFailure(args: {
  reason: FailureReason;
  isCalibration: boolean;
}): boolean {
  if (args.isCalibration) return false;
  return LAUNCH_RISK_REASONS.has(args.reason);
}

/**
 * Convenience: detect calibration orders by the synthetic email
 * pattern. The bulk-queue POST handler sets
 * `email: "calibration@geoviz.invalid"` for every [CAL] row.
 */
export function isCalibrationOrder(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().includes("calibration@geoviz.invalid");
}
