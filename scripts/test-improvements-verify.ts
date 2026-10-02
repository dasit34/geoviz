/* eslint-disable no-console */
/**
 * scripts/test-improvements-verify.ts — independent scanner verification:
 * each expectation passes/fails on fake sites, failed fetches are "Could
 * not verify" (never verified), retries/backoff, fixture isolation.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { fakeSite, html, type FakeRoute } from "./lib/website-fakes";
import type { Expectation } from "../src/lib/monitoring/improvements/drafts";
import { checkPage, runQueuedVerifications, VERIFY_BACKOFF_MS, VERIFY_MAX_ATTEMPTS, type ClaimedVerification, type VerificationStore } from "../src/lib/monitoring/improvements/verify";
import { evaluate } from "../src/lib/monitoring/improvements/expectations";

const h = harness("improvements-verify");
const lb = { "@context": "https://schema.org", "@type": "HVACBusiness", name: "Acme HVAC", telephone: "(614) 555-0100" };
const robotsOk: FakeRoute = { status: 200, body: "User-agent: *\nDisallow: /private\n" };
const site: Record<string, FakeRoute> = {
  "/robots.txt": robotsOk,
  "/": { status: 200, body: html({ title: "Acme HVAC | Furnace Repair in Columbus", description: "Acme HVAC in Columbus.", h1: "Acme HVAC", paragraphs: ["Furnace and AC service for Columbus homeowners."], jsonLd: lb }) },
  "/furnace-repair": { status: 200, body: html({ title: "Furnace Repair", h1: "Furnace Repair in Columbus", h2: ["How much does furnace repair cost in Columbus?"], paragraphs: ["Real answer text here for customers."] }) },
  "/old": { status: 404 },
  "/private/page": { status: 200, body: html({ title: "x", h1: "Furnace Repair" }) },
  "/locked": { status: 403 },
  "/slow": "timeout",
};
const deps = (routes = site) => ({ fetcher: fakeSite(routes).fetcher, sleep: async () => {} });
const check = async (url: string, exp: Expectation, routes = site) => evaluate(exp, await checkPage(url, deps(routes)));

(async () => {
  console.log("[improvements-verify] running...");

  await h.check("structured data: verified when LocalBusiness + confirmed phone are present; wrong phone → not found", async () => {
    assert.equal((await check("https://acme.example/", { type: "structured_data", url: "https://acme.example/", name: "Acme HVAC", phoneDigits: "6145550100" })).outcome, "verified");
    const wrong = await check("https://acme.example/", { type: "structured_data", url: "https://acme.example/", name: "Acme HVAC", phoneDigits: "6145559999" });
    assert.equal(wrong.outcome, "not_found");
    assert.match(wrong.observed, /HVACBusiness/);
  });

  await h.check("title/description: must change from the recorded before AND mention a confirmed fact", async () => {
    assert.equal((await check("https://acme.example/", { type: "title_description", url: "https://acme.example/", beforeTitle: "Home", beforeDescription: null, mustIncludeAny: ["Columbus"] })).outcome, "verified");
    assert.equal((await check("https://acme.example/", { type: "title_description", url: "https://acme.example/", beforeTitle: "Acme HVAC | Furnace Repair in Columbus", beforeDescription: "Acme HVAC in Columbus.", mustIncludeAny: ["Columbus"] })).outcome, "not_found");
  });

  await h.check("published page with keyword / FAQ questions; 404 → change not found yet", async () => {
    assert.equal((await check("https://acme.example/furnace-repair", { type: "page_with_keyword", keyword: "Furnace Repair" })).outcome, "verified");
    assert.equal((await check("https://acme.example/furnace-repair", { type: "page_with_keyword", keyword: "Heat Pumps" })).outcome, "not_found");
    assert.equal((await check("https://acme.example/furnace-repair", { type: "faq_present", questions: ["How much does furnace repair cost in Columbus?"] })).outcome, "verified");
    assert.equal((await check("https://acme.example/old", { type: "page_with_keyword", keyword: "x" })).outcome, "not_found");
  });

  await h.check("identity match + restored page", async () => {
    assert.equal((await check("https://acme.example/", { type: "identity_match", url: "https://acme.example/", name: "Acme HVAC", phoneDigits: "6145550100", street: null })).outcome, "verified");
    assert.equal((await check("https://acme.example/old", { type: "page_available", url: "https://acme.example/old" })).outcome, "not_found");
    assert.equal((await check("https://acme.example/furnace-repair", { type: "page_available", url: "https://acme.example/furnace-repair" })).outcome, "verified");
  });

  await h.check("fetch failures are 'could not verify' — never verified: 403, robots-disallowed, timeout, robots.txt down", async () => {
    const exp: Expectation = { type: "page_with_keyword", keyword: "Furnace Repair" };
    assert.equal((await check("https://acme.example/locked", exp)).outcome, "could_not_verify");
    const robots = await checkPage("https://acme.example/private/page", deps());
    assert.equal(robots.fetchStatus, "blocked_robots");
    assert.equal(evaluate(exp, robots).outcome, "could_not_verify", "robots-blocked page is never read");
    assert.equal((await check("https://acme.example/slow", exp)).outcome, "could_not_verify");
    assert.equal((await check("https://acme.example/", exp, { ...site, "/robots.txt": { status: 503 } })).outcome, "could_not_verify");
    assert.equal(evaluate({ type: "manual", instructions: "x" }, { url: "u", fetchStatus: "ok", httpStatus: 200, extracted: null }).outcome, "could_not_verify");
  });

  function memStore(rows: Array<ClaimedVerification & { status: string; nextRetryAt: Date | null; outcome?: string }>) {
    const store: VerificationStore = {
      async requeueStale() { return 0; },
      async claimNext(now, { fixtures }) {
        const r = rows.find((x) => x.status === "queued" && x.isFixture === (fixtures === true) && (!x.nextRetryAt || x.nextRetryAt <= now));
        if (!r) return null;
        r.status = "running";
        r.attempts += 1;
        return { ...r };
      },
      async complete({ v, evaluation }) { Object.assign(rows.find((x) => x.id === v.id)!, { status: "done", outcome: evaluation.outcome }); },
      async scheduleRetry({ v, nextRetryAt }) { Object.assign(rows.find((x) => x.id === v.id)!, { status: "queued", nextRetryAt }); },
    };
    return store;
  }

  await h.check("transient failures retry with backoff, then end as could_not_verify", async () => {
    const rows = [{ id: "v1", taskId: "t1", subscriptionId: "s", url: "https://acme.example/slow", expected: { type: "page_with_keyword", keyword: "x" } as Expectation, attempts: 0, isFixture: false, status: "queued", nextRetryAt: null as Date | null }];
    const store = memStore(rows);
    let now = new Date("2026-10-03T00:00:00Z");
    for (let i = 1; i <= VERIFY_MAX_ATTEMPTS; i += 1) {
      const r = await runQueuedVerifications({ store, now: () => now, maxChecks: 1, deps: () => deps() });
      assert.equal(r.outcomes.length, 1);
      if (i < VERIFY_MAX_ATTEMPTS) {
        assert.equal(r.outcomes[0]!.outcome, "retry");
        assert.equal(rows[0]!.nextRetryAt!.getTime(), now.getTime() + VERIFY_BACKOFF_MS[i - 1]!);
        now = rows[0]!.nextRetryAt!;
      } else assert.equal(r.outcomes[0]!.outcome, "could_not_verify");
    }
  });

  await h.check("fixture checks are never claimed by the real runner (and vice versa)", async () => {
    const rows = [
      { id: "real", taskId: "t", subscriptionId: "s", url: "https://acme.example/", expected: { type: "page_available", url: "https://acme.example/" } as Expectation, attempts: 0, isFixture: false, status: "queued", nextRetryAt: null as Date | null },
      { id: "fix", taskId: "t", subscriptionId: "s", url: "https://fixture-hvac.example/", expected: { type: "page_available", url: "https://fixture-hvac.example/" } as Expectation, attempts: 0, isFixture: true, status: "queued", nextRetryAt: null as Date | null },
    ];
    const store = memStore(rows);
    const real = await runQueuedVerifications({ store, now: () => new Date(), maxChecks: 5, deps: () => deps() });
    assert.deepEqual(real.outcomes.map((o) => o.id), ["real"]);
    const fx = await runQueuedVerifications({ store, now: () => new Date(), maxChecks: 5, fixtures: true, deps: () => deps() });
    assert.deepEqual(fx.outcomes.map((o) => o.id), ["fix"]);
  });

  h.done();
})();
