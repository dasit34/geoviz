/**
 * InstantlyProvider — outbound-email integration via Instantly's REST
 * API v2. This file's ONLY job is translating between GeoViz's
 * `OutboundProvider` contract and Instantly's request/response shapes
 * — normalization/dedup/eligibility logic lives in `src/lib/leads/`,
 * which has never heard of Instantly.
 *
 * ── Verified API surface (developer.instantly.ai + confirmed curl
 * examples, 2026-09-01) ──────────────────────────────────────────────
 *   Base URL: https://api.instantly.ai/api/v2
 *   Auth: `Authorization: Bearer <INSTANTLY_API_KEY>`
 *   GET  /campaigns              — list campaigns (query: limit,
 *                                  search, starting_after, status,
 *                                  tag_ids). Response: `{ items: [...] }`.
 *   POST /leads/add               — bulk add leads to a campaign or list.
 *                                  Request/response schema below in
 *                                  `sendLeads()`'s own comment.
 *   POST /leads/list               — list/poll leads (cursor-paginated,
 *                                  100/page via `pagination.next_starting_after`).
 *
 * ── NOT independently verified — flagged, not guessed ────────────────
 *   - The exact request body field Instantly's `/leads/list` uses to
 *     filter by campaign (used here as `campaign_id`, matching the
 *     field name every other verified endpoint uses — a reasonable
 *     but unconfirmed assumption).
 *   - The exact top-level response wrapper for `/leads/list` (assumed
 *     `{ items: [...] }` matching `/campaigns`'s shape — parsed
 *     defensively, tolerates a bare array too).
 *   - The precise meaning of numeric/enum status values Instantly
 *     returns per lead (`lt_interest_status` etc.) — see
 *     `src/lib/leads/normalizeOutreachStatus.ts`'s own doc comment for
 *     how this is handled defensively (unknown values pass through
 *     rather than being silently miscategorized).
 *   - Webhook signature/authenticity verification mechanism — NOT
 *     built this phase for exactly this reason. Known (documented)
 *     webhook event names, for future reference once verified:
 *     email_sent, email_opened, reply_received, auto_reply_received,
 *     link_clicked, email_bounced, lead_unsubscribed, lead_interested,
 *     lead_not_interested, lead_neutral, campaign_completed,
 *     account_error (+ meeting/closed/OOO/wrong-person events).
 *     Payload shape: `{timestamp, event_type, workspace, campaign_id,
 *     campaign_name, lead_email?, ...}`.
 *
 * ── Retry policy (mirrors src/lib/discovery/providers/outscraper.ts) ──
 *   `sendLeads()` (POST /leads/add) is a write with unconfirmed
 *   idempotency — NEVER auto-retried, even on timeout. A timeout there
 *   is genuinely ambiguous (leads may have already been created), so a
 *   failure returns a clean, honest error instead of guessing.
 *   `listCampaigns()`/`fetchCampaignLeadStatuses()` are read-only GETs
 *   — safe to retry once on a transient failure.
 *
 * Gating ladder (mirrors every other provider in this codebase):
 *   1. INSTANTLY_API_KEY not set → enabled() = false, caller sees a
 *      clean "not configured" response.
 *   2. Otherwise → real Instantly API calls.
 */

import { readApiKey } from "../../validators/apiKey";
import type {
  OutboundCampaign,
  OutboundLeadInput,
  OutboundLeadStatus,
  OutboundProvider,
  SendLeadOutcome,
  SendLeadsResult,
} from "../types";

const PROVIDER_NAME = "instantly";
const REQUIRED_ENV_VARS = ["INSTANTLY_API_KEY"] as const;

const BASE_URL = "https://api.instantly.ai/api/v2";
const CAMPAIGNS_PAGE_LIMIT = 100; // one bounded page — plenty for a picker dropdown
const STATUS_SYNC_PAGE_LIMIT = 100;
const MAX_STATUS_SYNC_PAGES = 5; // hard ceiling — bounded, mirrors discovery's spend-guardrail philosophy

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function requestTimeoutMs(): number {
  return envInt("INSTANTLY_REQUEST_TIMEOUT_MS", 15_000);
}

class InstantlyTimeoutError extends Error {}
class InstantlyRateLimitError extends Error {}
class InstantlyHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
class InstantlyMalformedResponseError extends Error {}

function missingKeys(): string[] {
  return REQUIRED_ENV_VARS.filter((k) => readApiKey(k) === null);
}

/**
 * TEMPORARY DIAGNOSTIC LOGGING (added 2026-09-03, remove once the
 * Instantly 401/403 investigation is closed and confirmed resolved).
 * Logs ONLY the upstream HTTP status, a truncated snippet of
 * Instantly's own error response body, the endpoint path, and the
 * campaign id (if the caller has one) — every one of those is either
 * non-secret (path, campaign id are GeoViz-internal identifiers) or is
 * Instantly's own error description of what went wrong, never our
 * request. Never logs: the API key, the Authorization header, any
 * other request header, or lead emails/PII (this function never sees
 * lead data — sendLeads() passes only a campaignId as context, not
 * the lead payload).
 */
function logInstantlyDiagnostic(path: string, status: number, bodySnippet: string, campaignId?: string) {
  console.error(
    `[outbound-diag] provider=instantly endpoint=${path} status=${status}${campaignId ? ` campaignId=${campaignId}` : ""} body=${bodySnippet.slice(0, 500)}`,
  );
}

/** Single HTTP call. Throws typed errors — never a generic Error, never includes the API key in any message. */
async function instantlyFetch(
  apiKey: string,
  path: string,
  init: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown },
  diagContext?: { campaignId?: string },
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(requestTimeoutMs()),
    });
  } catch (err) {
    throw new InstantlyTimeoutError(err instanceof Error ? err.message : String(err));
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const detail = errText ? `: ${errText.slice(0, 200)}` : "";
    logInstantlyDiagnostic(path, response.status, errText, diagContext?.campaignId);
    if (response.status === 429) throw new InstantlyRateLimitError(`HTTP 429${detail}`);
    throw new InstantlyHttpError(response.status, `HTTP ${response.status}${detail}`);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new InstantlyMalformedResponseError(
      `response body was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** GET calls only — read-only, safe to retry once on a transient failure. */
async function instantlyFetchWithRetry(
  apiKey: string,
  path: string,
  init: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown },
  diagContext?: { campaignId?: string },
): Promise<unknown> {
  try {
    return await instantlyFetch(apiKey, path, init, diagContext);
  } catch (err) {
    if (err instanceof InstantlyRateLimitError || err instanceof InstantlyHttpError) throw err;
    // Timeout or malformed response — one retry, since this is a read-only call.
    return await instantlyFetch(apiKey, path, init, diagContext);
  }
}

/**
 * Distinguishes upstream failure classes rather than collapsing them
 * into one generic message (hardened 2026-09-03 — the prior single
 * "invalid or insufficient permissions" string for both 401 and 403
 * made a genuine key-scope gap indistinguishable from an invalid key,
 * a campaign-state problem, or a validation error). `err.message` on
 * `InstantlyHttpError` already carries `HTTP {status}: {truncated
 * body}` from Instantly itself — surfaced here, not discarded, since
 * it's Instantly's own error description, not request data.
 */
function describeError(err: unknown, context: "submit" | "read"): string {
  if (err instanceof InstantlyTimeoutError) {
    return context === "submit"
      ? "Instantly did not respond in time — some leads may have already been created even though we didn't get a response. Not retrying automatically to avoid duplicate sends. Check Instantly's dashboard before resending."
      : "Instantly did not respond in time after a retry.";
  }
  if (err instanceof InstantlyRateLimitError) return "Instantly rate limit reached — try again later.";
  if (err instanceof InstantlyHttpError) {
    if (err.status === 401) return `Instantly rejected the API key as invalid: ${err.message}`;
    if (err.status === 403) return `Instantly denied this request — the key may be missing a required scope, or the campaign/workspace doesn't allow this action: ${err.message}`;
    if (err.status === 404) return `Campaign not found in Instantly: ${err.message}`;
    if (err.status === 400 || err.status === 422) return `Instantly rejected the request as invalid: ${err.message}`;
    return `Instantly request failed: ${err.message}`;
  }
  if (err instanceof InstantlyMalformedResponseError) {
    return `Instantly returned an unreadable response (${err.message}).`;
  }
  return err instanceof Error ? err.message : String(err);
}

type InstantlyCampaign = { id?: string; name?: string; status?: string | number };
type InstantlyCampaignsResponse = { items?: InstantlyCampaign[] };

type InstantlyCreatedLead = { index?: number; id?: string; email?: string };
type InstantlyAddLeadsResponse = {
  status?: string;
  total_sent?: number;
  leads_uploaded?: number;
  duplicated_leads?: number;
  duplicate_email_count?: number;
  invalid_email_count?: number;
  incomplete_count?: number;
  skipped_count?: number;
  created_leads?: InstantlyCreatedLead[];
};

type InstantlyLeadListItem = { id?: string; email?: string; status?: unknown; status_summary?: unknown };
type InstantlyLeadListResponse = { items?: InstantlyLeadListItem[]; pagination?: { next_starting_after?: string } };

export const InstantlyProvider: OutboundProvider = {
  name: PROVIDER_NAME,
  requiredEnvVars: REQUIRED_ENV_VARS,
  enabled(): boolean {
    return missingKeys().length === 0;
  },

  async listCampaigns() {
    const missing = missingKeys();
    if (missing.length > 0) return { campaigns: [], error: `${missing.join(", ")} not set` };

    const apiKey = readApiKey("INSTANTLY_API_KEY")!;
    try {
      const raw = await instantlyFetchWithRetry(apiKey, "/campaigns", {
        method: "GET",
        query: { limit: String(CAMPAIGNS_PAGE_LIMIT) },
      });
      const items = Array.isArray((raw as InstantlyCampaignsResponse)?.items)
        ? (raw as InstantlyCampaignsResponse).items!
        : [];
      const campaigns: OutboundCampaign[] = items
        .filter((c): c is InstantlyCampaign & { id: string; name: string } => Boolean(c.id && c.name))
        .map((c) => ({ id: c.id, name: c.name, status: c.status != null ? String(c.status) : null }));
      return { campaigns };
    } catch (err) {
      console.error(`[outbound] provider=${PROVIDER_NAME} listCampaigns failed: ${describeError(err, "read")}`);
      return { campaigns: [], error: describeError(err, "read") };
    }
  },

  /**
   * POST /leads/add. Body: `{campaign_id, leads: [{email, first_name,
   * last_name, company_name, website, phone, custom_variables}],
   * skip_if_in_campaign: true}` (belt-and-suspenders alongside
   * GeoViz's own `LeadOutreach` unique-constraint dedup). Response's
   * `created_leads[].index` maps back to the request array position —
   * verified detail, used to attribute per-lead success. Instantly's
   * verified response schema has NO per-lead failure-reason array,
   * only aggregate counts (duplicated_leads, invalid_email_count,
   * etc.) — so a lead absent from `created_leads` gets a single
   * honest, non-fabricated explanation referencing those aggregates
   * rather than an invented specific reason.
   */
  async sendLeads(campaignId: string, leads: OutboundLeadInput[]): Promise<SendLeadsResult> {
    const missing = missingKeys();
    if (missing.length > 0) return { outcomes: [], error: `${missing.join(", ")} not set` };
    if (leads.length === 0) return { outcomes: [] };

    const apiKey = readApiKey("INSTANTLY_API_KEY")!;
    const body = {
      campaign_id: campaignId,
      leads: leads.map((l) => ({
        email: l.email,
        first_name: l.firstName,
        last_name: l.lastName,
        company_name: l.companyName,
        website: l.website,
        phone: l.phone,
        custom_variables: l.customVariables,
      })),
      skip_if_in_campaign: true,
    };

    let raw: unknown;
    try {
      // One attempt — never retried, see file doc comment.
      raw = await instantlyFetch(apiKey, "/leads/add", { method: "POST", body }, { campaignId });
    } catch (err) {
      const message = describeError(err, "submit");
      console.error(`[outbound] provider=${PROVIDER_NAME} sendLeads failed (not retrying): ${message}`);
      return { outcomes: [], error: message };
    }

    const parsed = raw as InstantlyAddLeadsResponse;
    const createdByIndex = new Map<number, InstantlyCreatedLead>();
    for (const created of parsed.created_leads ?? []) {
      if (typeof created.index === "number") createdByIndex.set(created.index, created);
    }

    const aggregateNote = `duplicated=${parsed.duplicated_leads ?? 0} invalidEmail=${parsed.invalid_email_count ?? 0} incomplete=${parsed.incomplete_count ?? 0} skipped=${parsed.skipped_count ?? 0}`;

    const outcomes: SendLeadOutcome[] = leads.map((lead, index) => {
      const created = createdByIndex.get(index);
      if (created?.id) {
        return { leadId: lead.leadId, ok: true, providerLeadId: created.id };
      }
      return {
        leadId: lead.leadId,
        ok: false,
        error: `Instantly did not confirm this lead was created (${aggregateNote}) — Instantly's API doesn't return a per-lead reason, only these aggregate counts.`,
      };
    });

    console.log(
      `[outbound] provider=${PROVIDER_NAME} sendLeads campaignId=${campaignId} requested=${leads.length} created=${outcomes.filter((o) => o.ok).length}`,
    );
    return { outcomes };
  },

  /**
   * POST /leads/list — best-effort filter by `campaign_id` (field
   * name assumed from the pattern every other verified endpoint uses;
   * not independently confirmed for this specific endpoint — see file
   * doc comment). Response wrapper assumed `{items: [...]}` matching
   * `/campaigns`, but parsed defensively (also accepts a bare array)
   * since this wasn't independently confirmed either. Bounded to
   * MAX_STATUS_SYNC_PAGES pages so a sync action can't run away.
   */
  async fetchCampaignLeadStatuses(campaignId: string) {
    const missing = missingKeys();
    if (missing.length > 0) return { statuses: [], error: `${missing.join(", ")} not set` };

    const apiKey = readApiKey("INSTANTLY_API_KEY")!;
    const statuses: OutboundLeadStatus[] = [];
    let startingAfter: string | undefined;
    let pages = 0;

    try {
      do {
        const raw = await instantlyFetchWithRetry(
          apiKey,
          "/leads/list",
          {
            method: "POST",
            body: {
              campaign_id: campaignId,
              limit: STATUS_SYNC_PAGE_LIMIT,
              ...(startingAfter ? { starting_after: startingAfter } : {}),
            },
          },
          { campaignId },
        );
        pages += 1;

        const items = Array.isArray(raw)
          ? (raw as InstantlyLeadListItem[])
          : Array.isArray((raw as InstantlyLeadListResponse)?.items)
            ? (raw as InstantlyLeadListResponse).items!
            : [];

        for (const item of items) {
          if (!item.id) continue;
          statuses.push({
            providerLeadId: item.id,
            email: item.email ?? null,
            rawStatus: item.status_summary ?? item.status ?? null,
          });
        }

        startingAfter = Array.isArray(raw)
          ? undefined
          : (raw as InstantlyLeadListResponse)?.pagination?.next_starting_after;
      } while (startingAfter && pages < MAX_STATUS_SYNC_PAGES);

      return { statuses };
    } catch (err) {
      console.error(`[outbound] provider=${PROVIDER_NAME} fetchCampaignLeadStatuses failed: ${describeError(err, "read")}`);
      return { statuses, error: describeError(err, "read") };
    }
  },
};
