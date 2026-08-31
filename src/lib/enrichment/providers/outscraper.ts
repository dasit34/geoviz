/**
 * OutscraperEnrichmentProvider — contact enrichment via Outscraper's
 * Emails & Contacts API (`GET /emails-and-contacts`), which finds email
 * addresses, social links, and phones for a given domain.
 *
 * IMPORTANT — verified against https://docs.outscraper.com's endpoint
 * reference page: this endpoint does NOT return a contact person's
 * name or title, only domain-level emails/socials. `contactName` and
 * `contactTitle` are therefore always `null` here — never invented.
 *
 * Same bounded-synchronous-poll pattern as
 * `src/lib/discovery/providers/outscraper.ts` (shorter budget — this
 * is a single-domain lookup, not a multi-result search) — including
 * that file's hardened retry policy, applied identically here:
 *
 * ── Retry policy (hardened 2026-08-31, after live testing) ───────────
 * The SUBMIT call is NEVER retried automatically — a timeout or
 * malformed response is ambiguous (a job may already exist on
 * Outscraper's side), so retrying risks a duplicate lookup/spend.
 * Individual POLL calls ARE safe to retry within the bounded budget
 * (idempotent, read-only status check on a job id we already have) —
 * a single flaky poll no longer aborts the whole lookup.
 *
 * Gating ladder (mirrors the discovery provider):
 *   1. OUTSCRAPER_API_KEY not set → enabled() = false.
 *   2. No domain on the lead → findContact() itself returns a clean
 *      error without calling Outscraper (the route also checks this
 *      before calling the provider — belt and suspenders, see
 *      src/lib/leads/enrichLead.ts).
 */

import { readApiKey } from "../../validators/apiKey";
import type {
  ContactEnrichmentProvider,
  EnrichmentInput,
  EnrichmentResult,
  NormalizedContactRecord,
} from "../types";

const PROVIDER_NAME = "outscraper";
const REQUIRED_ENV_VARS = ["OUTSCRAPER_API_KEY"] as const;

const BASE_URL = "https://api.outscraper.com";
const MAX_ALTERNATE_EMAILS = 5;

// Same env-override pattern as the discovery provider — read fresh
// per-call, never cached at module load.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function submitTimeoutMs(): number {
  return envInt("OUTSCRAPER_SUBMIT_TIMEOUT_MS", 20_000);
}
function pollTimeoutMs(): number {
  return envInt("OUTSCRAPER_POLL_TIMEOUT_MS", 15_000);
}
function pollIntervalMs(): number {
  return envInt("OUTSCRAPER_POLL_INTERVAL_MS", 3_000);
}
// Smaller than discovery's — this is a single-domain lookup, not a
// multi-result search.
function pollBudgetMs(): number {
  return envInt("OUTSCRAPER_ENRICHMENT_POLL_BUDGET_MS", 20_000);
}

type OutscraperContactData = {
  query?: string;
  domain?: string;
  emails?: { value?: string; sources?: string[] }[];
  socials?: Record<string, string>;
};

type OutscraperResponse = {
  id?: string;
  status?: string;
  data?: OutscraperContactData[] | OutscraperContactData;
  results_location?: string;
  errorMessage?: string;
};

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

function firstRecord(
  data: OutscraperResponse["data"],
): OutscraperContactData | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

/**
 * Exported for unit testing
 * (scripts/test-outscraper-enrichment-normalization.ts). Pure — no I/O,
 * never throws, never invents a name/title.
 */
export function pickBestContact(
  domain: string,
  record: OutscraperContactData,
): NormalizedContactRecord | null {
  const rawEmails = (record.emails ?? [])
    .map((e) => e.value?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v));
  const uniqueEmails = Array.from(new Set(rawEmails));
  if (uniqueEmails.length === 0) return null;

  const domainSuffix = `@${domain.toLowerCase()}`;
  const preferred = uniqueEmails.find((e) => e.endsWith(domainSuffix));
  const contactEmail = preferred ?? uniqueEmails[0];
  const alternateEmails = uniqueEmails
    .filter((e) => e !== contactEmail)
    .slice(0, MAX_ALTERNATE_EMAILS);

  const socialsEntries = Object.entries(record.socials ?? {}).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );

  return {
    contactName: null,
    contactTitle: null,
    contactEmail,
    alternateEmails: alternateEmails.length > 0 ? alternateEmails : null,
    socials: socialsEntries.length > 0 ? Object.fromEntries(socialsEntries) : null,
  };
}

function missingKeys(): string[] {
  return REQUIRED_ENV_VARS.filter((k) => readApiKey(k) === null);
}

/** Same contract as the discovery provider's outscraperFetch — throws typed errors, never a generic Error. */
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
    throw new OutscraperTimeoutError(err instanceof Error ? err.message : String(err));
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

function describeSubmitFailure(err: unknown): string {
  if (err instanceof OutscraperTimeoutError) {
    return "Outscraper did not respond to the contact lookup in time — a job may have already been created on their side. Not retrying automatically to avoid duplicate spend. Try again in a few minutes.";
  }
  if (err instanceof OutscraperRateLimitError) {
    return "Outscraper rate limit reached — try again later.";
  }
  if (err instanceof OutscraperHttpError) {
    return `Outscraper rejected the lookup: ${err.message}`;
  }
  if (err instanceof OutscraperMalformedResponseError) {
    return `Outscraper accepted the request but returned an unreadable response (${err.message}). Not retrying automatically.`;
  }
  return err instanceof Error ? err.message : String(err);
}

export const OutscraperEnrichmentProvider: ContactEnrichmentProvider = {
  name: PROVIDER_NAME,
  requiredEnvVars: REQUIRED_ENV_VARS,
  enabled(): boolean {
    return missingKeys().length === 0;
  },
  async findContact(input: EnrichmentInput): Promise<EnrichmentResult> {
    if (!input.domain) {
      return { contact: null, error: "No domain available to enrich." };
    }
    const missing = missingKeys();
    if (missing.length > 0) {
      return { contact: null, error: `${missing.join(", ")} not set` };
    }

    const apiKey = readApiKey("OUTSCRAPER_API_KEY")!;
    let result: OutscraperResponse;

    // Submit — one attempt, never retried automatically.
    try {
      result = await outscraperFetch(
        apiKey,
        "/emails-and-contacts",
        { query: input.domain },
        submitTimeoutMs(),
      );
    } catch (err) {
      const message = describeSubmitFailure(err);
      console.error(`[enrichment] provider=${PROVIDER_NAME} submit failed (not retrying): ${message}`);
      return { contact: null, error: message };
    }

    try {
      if (result.status === "Pending" && result.id) {
        const requestId = result.id;
        const deadline = Date.now() + pollBudgetMs();
        while (Date.now() < deadline) {
          await sleep(pollIntervalMs());
          try {
            result = await outscraperFetch(apiKey, `/requests/${requestId}`, {}, pollTimeoutMs());
            if (result.status === "Success" || result.status === "Failure") break;
          } catch (pollErr) {
            console.error(
              `[enrichment] provider=${PROVIDER_NAME} poll attempt failed, retrying within budget: ${pollErr instanceof Error ? pollErr.message : String(pollErr)}`,
            );
          }
        }
      }

      if (result.status === "Failure") {
        return {
          contact: null,
          error: result.errorMessage ?? "Outscraper reported this lookup failed.",
        };
      }
      if (result.status !== "Success") {
        return {
          contact: null,
          error: "Outscraper is still processing this lookup after the polling budget ran out — try again shortly.",
        };
      }

      const record = firstRecord(result.data);
      if (!record) return { contact: null, error: "No contact data returned." };

      const contact = pickBestContact(input.domain, record);
      if (!contact) return { contact: null, error: "No email found for this domain." };

      return { contact };
    } catch (err) {
      const e = err as Error;
      console.error(
        `[enrichment] provider=${PROVIDER_NAME} unexpected failure: ${e.message ?? String(err)}`,
      );
      return { contact: null, error: e.message ?? String(err) };
    }
  },
};
