/**
 * Tests InstantlyProvider's error classification and retry policy —
 * entirely against a mocked global.fetch, no live network. Mirrors
 * scripts/test-outscraper-error-handling.ts's pattern. Proves: writes
 * (sendLeads) are never auto-retried; reads (listCampaigns,
 * fetchCampaignLeadStatuses) ARE safely retried once on a transient
 * failure; per-lead outcomes are attributed via created_leads[].index;
 * leads absent from created_leads get an honest, non-fabricated
 * explanation.
 * Run: npx tsx scripts/test-instantly-error-handling.ts
 */
import { InstantlyProvider } from "@/lib/outbound/providers/instantly";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

process.env.INSTANTLY_API_KEY = "test-fake-key-never-real-1234567890";
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

const sampleLead = {
  leadId: "lead_1",
  email: "test@example.com",
  firstName: "Test",
  lastName: "Person",
  companyName: "Test Co",
  website: "https://test.example.com",
  city: "Toledo",
  state: "OH",
  phone: null,
  customVariables: { geoviz_lead_id: "lead_1" },
};

async function run() {
  const KEY = process.env.INSTANTLY_API_KEY!;

  // sendLeads: submit timeout -> exactly one attempt, no retry.
  {
    const mock = installMockFetch([{ throw: new Error("simulated network abort") }]);
    const result = await InstantlyProvider.sendLeads("camp_1", [sampleLead]);
    assert(mock.callCount() === 1, "sendLeads timeout: exactly one attempt (no retry)");
    assert(result.outcomes.length === 0 && !!result.error, "sendLeads timeout: whole-batch error, no outcomes");
    assert(/not retrying/i.test(result.error ?? ""), "sendLeads timeout: error says not retrying");
    assert(!(result.error ?? "").includes(KEY), "sendLeads timeout: error never contains the API key");
  }

  // sendLeads: 404 campaign not found -> one attempt, clean message.
  {
    const mock = installMockFetch([errResponse(404, "not found")]);
    const result = await InstantlyProvider.sendLeads("camp_missing", [sampleLead]);
    assert(mock.callCount() === 1, "sendLeads 404: exactly one attempt (no retry)");
    assert(/campaign not found/i.test(result.error ?? ""), "sendLeads 404: clean 'campaign not found' message");
  }

  // sendLeads: 401 vs 403 -> distinct messages, neither collapsed into
  // the old generic "invalid or insufficient permissions" string, and
  // the real upstream body detail is surfaced (not discarded).
  {
    const mock401 = installMockFetch([errResponse(401, "invalid_api_key")]);
    const result401 = await InstantlyProvider.sendLeads("camp_1", [sampleLead]);
    assert(mock401.callCount() === 1, "sendLeads 401: exactly one attempt (no retry)");
    assert(/invalid/i.test(result401.error ?? "") && /401/.test(result401.error ?? ""), "sendLeads 401: message identifies an invalid-key failure");
    assert((result401.error ?? "").includes("invalid_api_key"), "sendLeads 401: real upstream body detail is surfaced, not discarded");
    assert(!(result401.error ?? "").includes(KEY), "sendLeads 401: error never contains the API key");

    const mock403 = installMockFetch([errResponse(403, "missing_scope: leads:create")]);
    const result403 = await InstantlyProvider.sendLeads("camp_1", [sampleLead]);
    assert(mock403.callCount() === 1, "sendLeads 403: exactly one attempt (no retry)");
    assert(/scope|permission/i.test(result403.error ?? "") && /403/.test(result403.error ?? ""), "sendLeads 403: message identifies a permission/scope failure");
    assert((result403.error ?? "").includes("missing_scope"), "sendLeads 403: real upstream body detail is surfaced, not discarded");
    assert(!(result403.error ?? "").includes(KEY), "sendLeads 403: error never contains the API key");

    assert(result401.error !== result403.error, "sendLeads: 401 and 403 no longer collapse into the same generic message");
  }

  // sendLeads: 400 validation error -> distinct from both 401 and 403.
  {
    const mock = installMockFetch([errResponse(400, "email is required")]);
    const result = await InstantlyProvider.sendLeads("camp_1", [sampleLead]);
    assert(mock.callCount() === 1, "sendLeads 400: exactly one attempt (no retry)");
    assert(/invalid/i.test(result.error ?? "") && (result.error ?? "").includes("email is required"), "sendLeads 400: validation error surfaced distinctly, not read as a permissions failure");
  }

  // sendLeads: 429 rate limit.
  {
    const mock = installMockFetch([errResponse(429, "slow down")]);
    const result = await InstantlyProvider.sendLeads("camp_1", [sampleLead]);
    assert(mock.callCount() === 1, "sendLeads 429: exactly one attempt (no retry)");
    assert(/rate limit/i.test(result.error ?? ""), "sendLeads 429: clean rate-limit message");
  }

  // sendLeads: malformed response (200 OK, but body isn't the expected shape).
  {
    // json() resolving successfully with a non-object body is itself
    // "malformed" from the caller's perspective — sendLeads should
    // treat it as zero created leads (no created_leads array to read),
    // not throw.
    const mock = installMockFetch([okJson("not an object")]);
    const result = await InstantlyProvider.sendLeads("camp_1", [sampleLead]);
    assert(mock.callCount() === 1, "sendLeads malformed: exactly one attempt, never crashes");
    assert(!result.error, "sendLeads malformed: no whole-batch error (valid JSON, just an unexpected shape)");
    assert(result.outcomes.length === 1 && result.outcomes[0].ok === false, "sendLeads malformed: the one lead is reported as not-confirmed, not silently dropped");
  }

  // sendLeads: success, per-lead attribution via created_leads[].index,
  // and an honest (non-fabricated) reason for the one Instantly didn't confirm.
  {
    const leads = [
      { ...sampleLead, leadId: "lead_a", email: "a@example.com" },
      { ...sampleLead, leadId: "lead_b", email: "b@example.com" },
    ];
    const mock = installMockFetch([
      okJson({
        status: "success",
        duplicated_leads: 1,
        invalid_email_count: 0,
        incomplete_count: 0,
        skipped_count: 0,
        created_leads: [{ index: 0, id: "instantly_lead_a", email: "a@example.com" }],
      }),
    ]);
    const result = await InstantlyProvider.sendLeads("camp_1", leads);
    assert(mock.callCount() === 1, "sendLeads success: exactly one attempt");
    const a = result.outcomes.find((o) => o.leadId === "lead_a");
    const b = result.outcomes.find((o) => o.leadId === "lead_b");
    assert(a?.ok === true && a.providerLeadId === "instantly_lead_a", "lead present in created_leads is attributed correctly via index");
    assert(b?.ok === false && /duplicated=1/.test(b.error), "lead absent from created_leads gets an honest, aggregate-based explanation (not a fabricated reason)");
  }

  // listCampaigns: transient failure then success -> safe retry (read-only).
  {
    const mock = installMockFetch([
      { throw: new Error("simulated blip") },
      okJson({ items: [{ id: "camp_1", name: "Test Campaign", status: "active" }] }),
    ]);
    const result = await InstantlyProvider.listCampaigns();
    assert(mock.callCount() === 2, "listCampaigns: retried once after a transient failure (safe — read-only)");
    assert(result.campaigns.length === 1 && result.campaigns[0].name === "Test Campaign", "listCampaigns: succeeds on retry with correct data");
  }

  // fetchCampaignLeadStatuses: transient failure then success -> safe retry.
  {
    const mock = installMockFetch([
      { throw: new Error("simulated blip") },
      okJson({ items: [{ id: "il_1", email: "a@example.com", status_summary: "interested" }] }),
    ]);
    const result = await InstantlyProvider.fetchCampaignLeadStatuses("camp_1");
    assert(mock.callCount() === 2, "fetchCampaignLeadStatuses: retried once after a transient failure");
    assert(result.statuses.length === 1 && result.statuses[0].providerLeadId === "il_1", "fetchCampaignLeadStatuses: succeeds on retry with correct data");
  }

  // Missing key -> clean errors, zero HTTP calls, across all three methods.
  {
    delete process.env.INSTANTLY_API_KEY;
    const mock = installMockFetch([]);
    assert(InstantlyProvider.enabled() === false, "enabled() is false with no INSTANTLY_API_KEY set");
    const c = await InstantlyProvider.listCampaigns();
    const s = await InstantlyProvider.sendLeads("camp_1", [sampleLead]);
    const f = await InstantlyProvider.fetchCampaignLeadStatuses("camp_1");
    assert(mock.callCount() === 0, "no HTTP call is ever made when the key is missing");
    assert(!!c.error && !!s.error && !!f.error, "all three methods return a clean error when the key is missing");
    process.env.INSTANTLY_API_KEY = KEY;
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
