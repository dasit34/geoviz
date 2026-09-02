/**
 * OutscraperProvider — business discovery via Outscraper's Google Maps
 * Search API (`GET /google-maps-search`).
 *
 * This file's ONLY job is translating Outscraper's response shape into
 * `NormalizedBusinessRecord` — same contract as `google-places.ts`. All
 * normalization/dedup logic lives in `src/lib/leads/`, which has never
 * heard of Outscraper.
 *
 * Outscraper's Maps Search endpoint is asynchronous by default
 * (`async: true`) — submit returns either an immediate `"Success"` or a
 * `"Pending"` status with a `results_location` to poll. This provider
 * implements a BOUNDED SYNCHRONOUS POLL inside `discoverBusinesses()`
 * (submit, then poll `GET /requests/{id}` up to the poll budget) so it
 * satisfies the exact same fully-synchronous `BusinessDiscoveryProvider`
 * contract `GooglePlacesProvider` already does.
 *
 * ── Resumable polling (added 2026-09-02) ──────────────────────────────
 * If the poll budget runs out while Outscraper is still `"Pending"`,
 * the job id is echoed back via `DiscoveryResult.providerJobId` (and,
 * earlier still, via the `onJobAccepted` callback fired the instant
 * submit is accepted) instead of being discarded. `resumeDiscovery(jobId)`
 * polls that SAME job id directly — it never calls `/google-maps-search`
 * again, so it can't create a second (billable) job. The caller (the
 * discover route) is responsible for persisting the id/status durably
 * and for guarding against submitting a fresh search while a matching
 * one is still `PENDING`; this file only guarantees it never
 * self-duplicates a submit.
 *
 * ── Retry policy (hardened 2026-08-31, after live testing) ───────────
 * The SUBMIT call is NEVER retried automatically. A submit request that
 * times out or comes back malformed is genuinely ambiguous — Outscraper
 * may have already created a job even though we never saw the response
 * — so retrying could create a duplicate job and duplicate spend.
 * Instead the caller gets a specific, honest error telling them a job
 * may exist and NOT to auto-resubmit.
 *
 * Individual POLL calls (`GET /requests/{id}`) ARE safe to retry within
 * the existing bounded budget: polling a job id we already have is a
 * read-only, idempotent status check — it can never create anything.
 * A single flaky poll no longer aborts the whole search; it's logged
 * and the bounded loop just continues to the next scheduled poll.
 *
 * Every failure path returns `records: []` — a timeout/error/malformed
 * response never imports partial results.
 *
 * Endpoint shapes verified against https://docs.outscraper.com endpoint
 * reference pages AND one real live search (2026-08-31, Toledo HVAC) —
 * see the `website` field comment below for a case where the docs page
 * was wrong and the live response was the ground truth.
 *
 * Gating ladder (mirrors google-places.ts):
 *   1. OUTSCRAPER_API_KEY not set → enabled() = false, caller sees a
 *      clean "no discovery provider configured" response.
 *   2. Otherwise → real Outscraper API calls.
 */

import { readApiKey } from "../../validators/apiKey";
import type {
  BusinessDiscoveryProvider,
  DiscoverBusinessesOptions,
  DiscoveryInput,
  DiscoveryResult,
  NormalizedBusinessRecord,
} from "../types";

const PROVIDER_NAME = "outscraper";
const REQUIRED_ENV_VARS = ["OUTSCRAPER_API_KEY"] as const;

const BASE_URL = "https://api.outscraper.com";

// All timing knobs are read fresh per-call (never cached at module load)
// via env overrides falling back to these hardened defaults, so ops can
// tune behavior without a code change and tests can shrink them to run
// fast without real waiting.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
// Live evidence (2026-08-31): 2 successful runs at 7.7s/8.7s total (2
// HTTP calls each); 1 outright submit timeout at the old 15s with zero
// response. Bumped modestly to absorb latency variance — NOT a signal
// that submits are routinely slow, just that one real failure was a
// full non-response rather than a slow-but-recoverable one.
function submitTimeoutMs(): number {
  return envInt("OUTSCRAPER_SUBMIT_TIMEOUT_MS", 20_000);
}
// Individual poll GET — lightweight status check, kept short on
// purpose so a stuck poll fails fast into the safe-retry path below
// rather than eating the whole budget on one hung call.
function pollTimeoutMs(): number {
  return envInt("OUTSCRAPER_POLL_TIMEOUT_MS", 15_000);
}
function pollIntervalMs(): number {
  return envInt("OUTSCRAPER_POLL_INTERVAL_MS", 3_000);
}
// Bounded wait for the whole poll cycle (after a Pending submit, or
// for a single resumeDiscovery() call). A timeout returns a clean
// "still processing" error — nothing is imported — but DOES echo the
// job id back (see finalizeResult()) so the caller can resume rather
// than resubmit. Hardened 2026-09-02 after a real production 50-
// business search: the prior 50_000 default gave the poll loop only
// ~16 iterations (~48s), which the production job hadn't finished
// within. Raised to 180_000 (3 min) — a reasoned estimate, not a
// live-verified number, chosen to comfortably clear the observed
// failure while staying well under the platform's function-duration
// ceiling once submit time + import/DB work are added on top (see
// maxDuration in the discover route). Still fully bounded, not
// infinite — resumeDiscovery() is the answer if 3 min genuinely isn't
// enough for a given search, not a bigger single-shot number here.
function pollBudgetMs(): number {
  return envInt("OUTSCRAPER_POLL_BUDGET_MS", 180_000);
}

type OutscraperPlace = {
  name?: string;
  place_id?: string;
  full_address?: string;
  city?: string;
  us_state?: string;
  state?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  // Verified against a live response (2026-08-31): Outscraper's
  // google-maps-search returns the business's own site under
  // `website`, NOT `site` as docs.outscraper.com's page described —
  // that page was wrong/stale for this endpoint. Kept `site` as a
  // defensive fallback in case a differently-configured request ever
  // returns it under the old name.
  website?: string;
  site?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviews?: number;
  location_link?: string;
};

type OutscraperResponse = {
  id?: string;
  status?: string; // "Success" | "Pending" | "Failure" | other
  data?: OutscraperPlace[] | OutscraperPlace[][];
  results_location?: string;
  errorMessage?: string;
};

// ── Typed failure classification ──────────────────────────────────────
// Distinguishing these matters for the retry decision: TimeoutError is
// the ambiguous "a job may already exist" case (never retried); a clean
// HTTP error means Outscraper rejected the request fast (retrying the
// same request won't help); a malformed response means the request WAS
// accepted but we can't read the result (also ambiguous — not retried).
class OutscraperTimeoutError extends Error {}
class OutscraperRateLimitError extends Error {}
class OutscraperHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
class OutscraperMalformedResponseError extends Error {}

/** Handles both a flat place array and Outscraper's documented array-per-query shape. */
function flattenPlaces(data: OutscraperResponse["data"]): OutscraperPlace[] {
  if (!Array.isArray(data)) return [];
  if (data.length === 0) return [];
  if (Array.isArray(data[0])) {
    return (data as OutscraperPlace[][]).flat();
  }
  return data as OutscraperPlace[];
}

/**
 * Exported for unit testing (scripts/test-outscraper-discovery-normalization.ts).
 * Pure — no I/O, never throws.
 */
export function toNormalizedRecord(place: OutscraperPlace): NormalizedBusinessRecord | null {
  if (!place.place_id || !place.name) return null;
  return {
    provider: PROVIDER_NAME,
    providerId: place.place_id,
    businessName: place.name,
    website: place.website ?? place.site ?? null,
    phone: place.phone ?? null,
    address: place.full_address ?? null,
    city: place.city ?? null,
    state: place.us_state ?? place.state ?? null,
    categoryRaw: place.category ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.reviews === "number" ? place.reviews : null,
    zip: place.postal_code ?? null,
    latitude: typeof place.latitude === "number" ? place.latitude : null,
    longitude: typeof place.longitude === "number" ? place.longitude : null,
    mapsUrl: place.location_link ?? null,
    raw: place,
  };
}

function missingKeys(): string[] {
  return REQUIRED_ENV_VARS.filter((k) => readApiKey(k) === null);
}

function buildQueryText(input: DiscoveryInput): string {
  const location = input.state ? `${input.city}, ${input.state}` : input.city;
  const radiusPhrase = input.radiusMiles ? ` within ${input.radiusMiles} miles` : "";
  return `${input.category} in ${location}${radiusPhrase}`;
}

/**
 * Single HTTP call. Throws one of the typed errors above — never a
 * generic Error — so callers can classify the failure without
 * re-parsing message text. Never includes request headers (the API
 * key) in any thrown message; response bodies are truncated.
 */
async function outscraperFetch(
  apiKey: string,
  path: string,
  params: Record<string, string>,
  timeoutMs: number,
): Promise<OutscraperResponse> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // No response at all — network failure or the AbortSignal fired.
    // Ambiguous: Outscraper may have received and processed the
    // request before we gave up waiting.
    throw new OutscraperTimeoutError(
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const detail = errText ? `: ${errText.slice(0, 200)}` : "";
    if (response.status === 429) {
      throw new OutscraperRateLimitError(`HTTP 429${detail}`);
    }
    throw new OutscraperHttpError(response.status, `HTTP ${response.status}${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    throw new OutscraperMalformedResponseError(
      `response body was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as OutscraperResponse).status !== "string"
  ) {
    throw new OutscraperMalformedResponseError("response was missing an expected 'status' field");
  }
  return parsed as OutscraperResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Maps a submit-call failure to a clear, operator-facing message. Never retried. */
function describeSubmitFailure(err: unknown): string {
  if (err instanceof OutscraperTimeoutError) {
    return "Outscraper did not respond to the search request in time — a job may have already been created on their side even though we never got a response. Not retrying automatically to avoid creating a duplicate job. Check Outscraper's request history, or try again in a few minutes.";
  }
  if (err instanceof OutscraperRateLimitError) {
    return "Outscraper rate limit reached — try again later.";
  }
  if (err instanceof OutscraperHttpError) {
    return `Outscraper rejected the search request: ${err.message}`;
  }
  if (err instanceof OutscraperMalformedResponseError) {
    return `Outscraper accepted the request but returned an unreadable response (${err.message}) — a job may be running that can't be tracked from here. Not retrying automatically.`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Bounded poll loop against an already-known job id. Individual poll
 * failures are safe to retry within the budget (read-only status
 * check); a single flaky poll never aborts the run. Shared by both
 * `discoverBusinesses()` (after a Pending submit) and
 * `resumeDiscovery()` (given a previously-persisted job id) — exactly
 * one poll implementation, never duplicated.
 */
async function pollJob(
  apiKey: string,
  requestId: string,
  startResult: OutscraperResponse,
  startHttpCalls: number,
): Promise<{ result: OutscraperResponse; httpCalls: number }> {
  let result = startResult;
  let httpCalls = startHttpCalls;
  const deadline = Date.now() + pollBudgetMs();
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs());
    try {
      httpCalls += 1;
      result = await outscraperFetch(apiKey, `/requests/${requestId}`, {}, pollTimeoutMs());
      if (result.status === "Success" || result.status === "Failure") break;
    } catch (pollErr) {
      console.error(
        `[discovery] provider=${PROVIDER_NAME} poll attempt failed, retrying within budget: ${pollErr instanceof Error ? pollErr.message : String(pollErr)}`,
      );
      // Not fatal — loop continues to the next scheduled poll.
    }
  }
  return { result, httpCalls };
}

/**
 * Turns a final (or budget-exhausted) OutscraperResponse into the
 * provider's public DiscoveryResult shape. Stamps providerJobId /
 * providerJobStatus in EVERY branch — including the still-pending
 * timeout branch, which is what makes resumeDiscovery() possible.
 * Shared by discoverBusinesses() and resumeDiscovery().
 */
function finalizeResult(result: OutscraperResponse, httpCalls: number, requestId: string | undefined): DiscoveryResult {
  if (result.status === "Failure") {
    console.log(`[discovery] provider=${PROVIDER_NAME} reported Failure httpCalls=${httpCalls}`);
    return {
      records: [],
      providerRequestCount: httpCalls,
      error: result.errorMessage ?? "Outscraper reported this search failed.",
      providerJobId: requestId,
      providerJobStatus: "FAILURE",
    };
  }

  if (result.status !== "Success") {
    console.log(
      `[discovery] provider=${PROVIDER_NAME} polling budget exhausted status=${result.status ?? "unknown"} httpCalls=${httpCalls}`,
    );
    return {
      records: [],
      providerRequestCount: httpCalls,
      error:
        "Outscraper is still processing this search after the polling budget ran out — nothing was imported. This job can be resumed instead of resubmitted.",
      providerJobId: requestId,
      providerJobStatus: "PENDING",
    };
  }

  const places = flattenPlaces(result.data);
  const records: NormalizedBusinessRecord[] = [];
  for (const place of places) {
    const record = toNormalizedRecord(place);
    if (record) records.push(record);
  }
  console.log(
    `[discovery] provider=${PROVIDER_NAME} httpCalls=${httpCalls} received=${places.length} normalized=${records.length}`,
  );
  return {
    records,
    providerRequestCount: httpCalls,
    providerJobId: requestId,
    providerJobStatus: "SUCCESS",
  };
}

export const OutscraperProvider: BusinessDiscoveryProvider = {
  name: PROVIDER_NAME,
  requiredEnvVars: REQUIRED_ENV_VARS,
  enabled(): boolean {
    return missingKeys().length === 0;
  },
  async discoverBusinesses(input: DiscoveryInput, opts?: DiscoverBusinessesOptions): Promise<DiscoveryResult> {
    const missing = missingKeys();
    if (missing.length > 0) {
      return { records: [], providerRequestCount: 0, error: `${missing.join(", ")} not set` };
    }

    const apiKey = readApiKey("OUTSCRAPER_API_KEY")!;
    let httpCalls = 0;
    let result: OutscraperResponse;

    // ── Submit — exactly one attempt, never retried automatically. ──
    try {
      httpCalls += 1; // counts the attempt regardless of outcome
      result = await outscraperFetch(
        apiKey,
        "/google-maps-search",
        { query: buildQueryText(input), limit: String(Math.max(1, input.limit)), async: "true" },
        submitTimeoutMs(),
      );
    } catch (err) {
      const message = describeSubmitFailure(err);
      console.error(`[discovery] provider=${PROVIDER_NAME} submit failed (not retrying): ${message}`);
      return { records: [], providerRequestCount: httpCalls, error: message };
    }

    try {
      const requestId = result.id;
      if (result.status === "Pending" && requestId) {
        // Job accepted — hand the id to the caller BEFORE polling
        // starts, so it's durable even if this request is later
        // killed by the platform mid-poll.
        if (opts?.onJobAccepted) {
          await opts.onJobAccepted(requestId);
        }
        const polled = await pollJob(apiKey, requestId, result, httpCalls);
        result = polled.result;
        httpCalls = polled.httpCalls;
      }
      return finalizeResult(result, httpCalls, requestId);
    } catch (err) {
      // Last-resort safety net for anything genuinely unexpected — the
      // classified paths above already return normally, they don't
      // throw, so this should not fire in practice.
      const e = err as Error;
      console.error(
        `[discovery] provider=${PROVIDER_NAME} unexpected failure after httpCalls=${httpCalls}: ${e.message ?? String(err)}`,
      );
      return { records: [], providerRequestCount: httpCalls, error: e.message ?? String(err) };
    }
  },
  /**
   * Resumes polling a previously-submitted job by id. Never calls
   * `/google-maps-search` — structurally cannot create a second job.
   */
  async resumeDiscovery(jobId: string): Promise<DiscoveryResult> {
    const missing = missingKeys();
    if (missing.length > 0) {
      return { records: [], providerRequestCount: 0, error: `${missing.join(", ")} not set` };
    }
    const apiKey = readApiKey("OUTSCRAPER_API_KEY")!;
    try {
      const polled = await pollJob(apiKey, jobId, { status: "Pending", id: jobId }, 0);
      return finalizeResult(polled.result, polled.httpCalls, jobId);
    } catch (err) {
      const e = err as Error;
      console.error(`[discovery] provider=${PROVIDER_NAME} resume failed jobId=${jobId}: ${e.message ?? String(err)}`);
      return { records: [], providerRequestCount: 0, error: e.message ?? String(err), providerJobId: jobId, providerJobStatus: "PENDING" };
    }
  },
};
