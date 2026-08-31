/**
 * Tests the hardened Outscraper submit/poll retry policy for BOTH
 * providers, entirely against a mocked global.fetch — no live network
 * calls. Proves: submit failures are never auto-retried (ambiguous —
 * a job may already exist), individual poll failures ARE safely
 * retried within the bounded budget, polling stays bounded and fails
 * cleanly, and no failure path ever returns partial records/a contact.
 * Run: npx tsx scripts/test-outscraper-error-handling.ts
 */
import { OutscraperProvider } from "@/lib/discovery/providers/outscraper";
import { OutscraperEnrichmentProvider } from "@/lib/enrichment/providers/outscraper";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

process.env.OUTSCRAPER_API_KEY = "test-fake-key-never-real-1234567890";
const originalFetch = globalThis.fetch;

type MockResponse = { ok: boolean; status?: number; text?: () => Promise<string>; json?: () => Promise<unknown> };
type MockStep = { response?: MockResponse; throw?: Error };

function installMockFetch(steps: MockStep[]): { callCount: () => number } {
  let i = 0;
  globalThis.fetch = (async () => {
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (step.throw) throw step.throw;
    return step.response as unknown as Response;
  }) as typeof fetch;
  return { callCount: () => i };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function okJson(body: unknown): MockStep {
  return { response: { ok: true, json: async () => body } };
}
function errResponse(status: number, body: string): MockStep {
  return { response: { ok: false, status, text: async () => body } };
}

async function run() {
  const input = { category: "HVAC", city: "Toledo", state: "OH", limit: 3 };
  const KEY = process.env.OUTSCRAPER_API_KEY!;

  // 1. Submit timeout/abort -> exactly one attempt, no retry.
  {
    const mock = installMockFetch([{ throw: new Error("simulated network abort") }]);
    const result = await OutscraperProvider.discoverBusinesses(input);
    assert(mock.callCount() === 1, "[discovery] submit timeout: exactly one HTTP attempt (no retry)");
    assert(result.records.length === 0, "[discovery] submit timeout: records is empty");
    assert(result.providerRequestCount === 1, "[discovery] submit timeout: providerRequestCount counts the one attempt");
    assert(/not retrying/i.test(result.error ?? ""), "[discovery] submit timeout: error explicitly says not retrying");
    assert(!(result.error ?? "").includes(KEY), "[discovery] submit timeout: error never contains the API key");
  }

  // 2. HTTP error (401) -> one attempt, no retry, no key leak.
  {
    const mock = installMockFetch([errResponse(401, "Invalid API key")]);
    const result = await OutscraperProvider.discoverBusinesses(input);
    assert(mock.callCount() === 1, "[discovery] HTTP 401: exactly one attempt (no retry)");
    assert(result.records.length === 0, "[discovery] HTTP 401: records is empty");
    assert((result.error ?? "").includes("401"), "[discovery] HTTP 401: error surfaces the status code");
    assert(!(result.error ?? "").includes(KEY), "[discovery] HTTP 401: error never contains the API key");
  }

  // 3. Rate limited (429).
  {
    const mock = installMockFetch([errResponse(429, "Too Many Requests")]);
    const result = await OutscraperProvider.discoverBusinesses(input);
    assert(mock.callCount() === 1, "[discovery] HTTP 429: exactly one attempt (no retry)");
    assert(/rate limit/i.test(result.error ?? ""), "[discovery] HTTP 429: error clearly identifies rate limiting");
  }

  // 4. Malformed response (200 OK, missing status field).
  {
    const mock = installMockFetch([okJson({ unexpected: true })]);
    const result = await OutscraperProvider.discoverBusinesses(input);
    assert(mock.callCount() === 1, "[discovery] malformed response: exactly one attempt (no retry)");
    assert(result.records.length === 0, "[discovery] malformed response: records is empty");
    assert(/not retrying/i.test(result.error ?? ""), "[discovery] malformed response: error says not retrying");
  }

  // 5. Poll transient failure THEN success — proves a single flaky
  // poll does not abort the run.
  {
    process.env.OUTSCRAPER_POLL_INTERVAL_MS = "5";
    process.env.OUTSCRAPER_POLL_BUDGET_MS = "5000";
    const mock = installMockFetch([
      okJson({ id: "job1", status: "Pending" }),
      { throw: new Error("simulated poll network blip") },
      okJson({ id: "job1", status: "Success", data: [[{ name: "Flaky Poll Co", place_id: "ChIJflaky" }]] }),
    ]);
    const result = await OutscraperProvider.discoverBusinesses(input);
    assert(mock.callCount() === 3, "[discovery] flaky poll: 3 HTTP attempts (submit + failed poll + successful poll)");
    assert(result.records.length === 1 && result.records[0].businessName === "Flaky Poll Co", "[discovery] flaky poll: a transient poll failure does not abort the run — final success still returns records");
    assert(!result.error, "[discovery] flaky poll: no error on the eventually-successful run");
    delete process.env.OUTSCRAPER_POLL_INTERVAL_MS;
    delete process.env.OUTSCRAPER_POLL_BUDGET_MS;
  }

  // 6. Poll budget exhausted (always Pending) -> clean timeout, no partial import.
  {
    process.env.OUTSCRAPER_POLL_INTERVAL_MS = "5";
    process.env.OUTSCRAPER_POLL_BUDGET_MS = "30";
    const mock = installMockFetch([okJson({ id: "job2", status: "Pending" })]); // every call returns Pending
    const result = await OutscraperProvider.discoverBusinesses(input);
    assert(mock.callCount() >= 1, "[discovery] poll budget exhausted: at least the submit call happened");
    assert(result.records.length === 0, "[discovery] poll budget exhausted: records is empty (no partial import)");
    assert(/polling budget ran out|still processing/i.test(result.error ?? ""), "[discovery] poll budget exhausted: clear 'still processing' error");
    delete process.env.OUTSCRAPER_POLL_INTERVAL_MS;
    delete process.env.OUTSCRAPER_POLL_BUDGET_MS;
  }

  // 7. status: "Failure" from a poll -> reported distinctly, not conflated with a timeout.
  {
    process.env.OUTSCRAPER_POLL_INTERVAL_MS = "5";
    const mock = installMockFetch([
      okJson({ id: "job3", status: "Pending" }),
      okJson({ id: "job3", status: "Failure", errorMessage: "invalid search parameters" }),
    ]);
    const result = await OutscraperProvider.discoverBusinesses(input);
    assert(result.records.length === 0, "[discovery] provider Failure: records is empty");
    assert(result.error === "invalid search parameters", "[discovery] provider Failure: error is the provider's own message, not a generic timeout message");
    delete process.env.OUTSCRAPER_POLL_INTERVAL_MS;
    void mock;
  }

  // ── Enrichment provider — same policy, subset of cases ──────────────
  const enrichInput = { businessName: "Test Co", domain: "example.com", website: "https://example.com" };

  // 8. Submit timeout -> one attempt, no retry.
  {
    const mock = installMockFetch([{ throw: new Error("simulated network abort") }]);
    const result = await OutscraperEnrichmentProvider.findContact(enrichInput);
    assert(mock.callCount() === 1, "[enrichment] submit timeout: exactly one HTTP attempt (no retry)");
    assert(result.contact === null, "[enrichment] submit timeout: contact is null");
    assert(/not retrying/i.test(result.error ?? ""), "[enrichment] submit timeout: error says not retrying");
    assert(!(result.error ?? "").includes(KEY), "[enrichment] submit timeout: error never contains the API key");
  }

  // 9. Malformed response.
  {
    const mock = installMockFetch([okJson({ unexpected: true })]);
    const result = await OutscraperEnrichmentProvider.findContact(enrichInput);
    assert(mock.callCount() === 1, "[enrichment] malformed response: exactly one attempt (no retry)");
    assert(result.contact === null, "[enrichment] malformed response: contact is null");
  }

  // 10. Flaky poll then success.
  {
    process.env.OUTSCRAPER_POLL_INTERVAL_MS = "5";
    process.env.OUTSCRAPER_ENRICHMENT_POLL_BUDGET_MS = "5000";
    const mock = installMockFetch([
      okJson({ id: "job4", status: "Pending" }),
      { throw: new Error("simulated poll network blip") },
      okJson({ id: "job4", status: "Success", data: { domain: "example.com", emails: [{ value: "info@example.com" }] } }),
    ]);
    const result = await OutscraperEnrichmentProvider.findContact(enrichInput);
    assert(mock.callCount() === 3, "[enrichment] flaky poll: 3 HTTP attempts (submit + failed poll + successful poll)");
    assert(result.contact?.contactEmail === "info@example.com", "[enrichment] flaky poll: a transient poll failure does not abort the run — final success still returns a contact");
    delete process.env.OUTSCRAPER_POLL_INTERVAL_MS;
    delete process.env.OUTSCRAPER_ENRICHMENT_POLL_BUDGET_MS;
  }

  restoreFetch();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

run().catch((e) => {
  restoreFetch();
  console.error("TEST FAILED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
