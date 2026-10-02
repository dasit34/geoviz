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
import { buildContentBaseline, evaluate, keywordMatches, textMatches } from "../src/lib/monitoring/improvements/expectations";

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

  // ── Proposed-content checks (FAQ / new page): baseline-aware ──────────
  const B = (present: Array<{ text: string; url: string }>, impl: { captured: boolean; discovered: boolean } = { captured: false, discovered: false }) =>
    ({ scanId: "scan_before", at: "2026-10-01T00:00:00.000Z", present, implementationPage: impl });
  const Q1 = "How much does furnace repair cost in Columbus?";
  const Q2 = "Do you offer same-day AC repair in Dublin?";
  const faqSite: Record<string, FakeRoute> = {
    ...site,
    "/unrelated-faq": { status: 200, body: html({ title: "FAQ", h1: "FAQ", h2: ["What payment methods do you accept?"], paragraphs: ["We accept cards."], jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] } }) },
    "/faq-both": { status: 200, body: html({ title: "FAQ", h1: "FAQ", h2: [Q1, "Do you offer same day AC repairs in Dublin, Ohio?"], paragraphs: ["Real answers."] }) },
  };
  const faq = (baseline: ReturnType<typeof B> | null): Expectation => ({ type: "faq_present", questions: [Q1, Q2], baseline });

  await h.check("REGRESSION: existing/unrelated FAQ markup alone never verifies", async () => {
    const r = await check("https://acme.example/unrelated-faq", faq(B([])), faqSite);
    assert.equal(r.outcome, "not_found");
    assert.match(r.observed, /Proposed content not found: 0 of 2 .*other FAQ content, which doesn't count/);
  });

  await h.check("proposed content already present in the baseline → already_present (not verified)", async () => {
    const r = await check("https://acme.example/furnace-repair", faq(B([{ text: Q1, url: "https://acme.example/furnace-repair" }], { captured: true, discovered: true })), faqSite);
    assert.equal(r.outcome, "already_present");
    assert.match(r.observed, /already on your site before this task \(2026-10-01 snapshot\)/);
  });

  await h.check("proposed content newly observed after implementation → verified, listing what's new vs. old", async () => {
    const r = await check("https://acme.example/faq-both", faq(B([{ text: Q1, url: "https://acme.example/furnace-repair" }])), faqSite);
    assert.equal(r.outcome, "verified");
    assert.match(r.observed, /Newly observed after your change: "Do you offer same-day AC repair in Dublin\?"; already on your site before/);
  });

  await h.check("proposed content missing → not_found", async () => {
    assert.equal((await check("https://acme.example/", faq(B([])), faqSite)).outcome, "not_found");
    assert.equal((await check("https://acme.example/old", faq(B([])), faqSite)).outcome, "not_found");
  });

  await h.check("unable to check: fetch failure, robots block, no baseline, or uncaptured pre-existing page", async () => {
    for (const path of ["/locked", "/slow", "/private/page"]) assert.equal((await check(`https://acme.example${path}`, faq(B([])), faqSite)).outcome, "could_not_verify", path);
    const none = await check("https://acme.example/faq-both", faq(null), faqSite);
    assert.equal(none.outcome, "could_not_verify", "no earlier snapshot → never verified");
    assert.match(none.observed, /no earlier snapshot/);
    const legacy = await check("https://acme.example/faq-both", { type: "faq_present", questions: [Q1] }, faqSite);
    assert.equal(legacy.outcome, "could_not_verify", "checks queued without a baseline field are never verified");
    assert.equal((await check("https://acme.example/faq-both", faq(B([], { captured: false, discovered: true })), faqSite)).outcome, "could_not_verify");
  });

  await h.check("matching tolerates small wording edits but not unrelated questions", () => {
    assert.equal(textMatches(Q2, ["Do you offer same day AC repairs in Dublin, Ohio?"]), true);
    assert.equal(textMatches(Q2, ["What payment methods do you accept?"]), false);
    assert.equal(textMatches(Q1, ["furnace", "repair", "cost", "columbus"]), false, "words must co-occur in one heading/block");
    // REGRESSION (staging): a prose paragraph sharing common words is not the question.
    const prose = "Columbus Heating & Cooling has been proudly serving the Columbus, OH community and surrounding areas for over a decade. We are a family-owned and operated HVAC company committed to providing honest, high-quality service.";
    assert.equal(textMatches("Is Columbus Heating & Cooling a trustworthy HVAC company?", [prose]), false);
    assert.equal(textMatches("Is Columbus Heating & Cooling a trustworthy HVAC company?", ["Is Columbus Heating and Cooling a trustworthy HVAC company?"]), true);
    assert.equal(keywordMatches("Furnace Repair", ["Furnace Repair in Columbus"]), true);
    assert.equal(keywordMatches("Furnace Repair", ["Repair services"]), false);
  });

  await h.check("baseline builder: present items, implementation page captured/discovered", () => {
    const pages = [{ url: "https://acme.example/faq", normalizedUrl: "acme.example/faq", title: "FAQ", headings: { h1: [], h2: [Q1], h3: [] }, contentBlocks: [] }];
    const b = buildContentBaseline({ exp: faq(null), implementationUrl: "https://www.acme.example/faq/", scan: { id: "s", completedAt: new Date("2026-10-01"), discoveredUrls: ["acme.example/faq"] }, pages })!;
    assert.deepEqual(b.present, [{ text: Q1, url: "https://acme.example/faq" }]);
    assert.deepEqual(b.implementationPage, { captured: true, discovered: true });
    assert.equal(buildContentBaseline({ exp: faq(null), implementationUrl: null, scan: null, pages }), null);
  });

  await h.check("new page with keyword: already on that URL before → already_present; brand-new page → verified", async () => {
    const kw = (baseline: ReturnType<typeof B> | null): Expectation => ({ type: "page_with_keyword", keyword: "Furnace Repair", baseline });
    assert.equal((await check("https://acme.example/furnace-repair", kw(B([{ text: "Furnace Repair", url: "https://acme.example/furnace-repair" }], { captured: true, discovered: true })))).outcome, "already_present");
    assert.equal((await check("https://acme.example/furnace-repair", kw(B([])))).outcome, "verified");
    assert.equal((await check("https://acme.example/furnace-repair", { type: "page_with_keyword", keyword: "Heat Pumps", baseline: B([]) })).outcome, "not_found");
    assert.equal((await check("https://acme.example/furnace-repair", kw(null))).outcome, "could_not_verify");
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
