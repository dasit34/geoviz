/* eslint-disable no-console */
/**
 * scripts/test-website-jobs.ts — website scans as separate retryable jobs:
 * idempotent enqueue, atomic claims, backoff, terminal site rules, stale
 * recovery, scheduler isolation, scan targets / confirmed domains,
 * entitlements, route access control, and evidence-backed findings.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createFakeStore, harness, T0 } from "./lib/monitoring-fakes";
import { fakeSite, html, type FakeRoute } from "./lib/website-fakes";
import { EARLY_ACCESS_ENTITLEMENTS } from "../src/lib/monitoring/plans";
import { runMonitoringSchedulerTick } from "../src/lib/monitoring/scheduler";
import { buildRecommendations } from "../src/lib/monitoring/tracking/recommendations";
import { websiteFindings, type ChangeForFindings } from "../src/lib/monitoring/website/findings";
import {
  BACKOFF_MS,
  enqueueWebsiteScans,
  MAX_ATTEMPTS,
  runQueuedWebsiteScans,
  STALE_MS,
  type ClaimedScan,
  type PreviousScan,
  type WebsiteScanStore,
} from "../src/lib/monitoring/website/scan-job";
import { decideCompetitorWebsite, scanTargets, type ScanTarget } from "../src/lib/monitoring/website/targets";

const h = harness("website-jobs");
const WT = EARLY_ACCESS_ENTITLEMENTS.websiteTracking;

type Row = ClaimedScan & { status: string; nextRetryAt: Date | null; claimedAt: Date | null; lastError: string | null; savedPages: number; diff: string | null; requests: number; completedAt: Date | null; changes: number };

function memoryStore() {
  const rows: Row[] = [];
  const saved: Array<{ id: string; prev: PreviousScan }> = [];
  const store: WebsiteScanStore = {
    async enqueue({ subscriptionId, cycleKey, target, isFixture }) {
      if (rows.some((r) => r.subscriptionId === subscriptionId && r.cycleKey === cycleKey && r.siteDomain === target.siteDomain)) return "exists";
      rows.push({ id: `scan_${rows.length + 1}`, subscriptionId, cycleKey, siteKind: target.siteKind, siteDomain: target.siteDomain, siteUrl: target.siteUrl, trackedCompetitorId: target.trackedCompetitorId, attempts: 0, isFixture, status: "queued", nextRetryAt: null, claimedAt: null, lastError: null, savedPages: 0, diff: null, requests: 0, completedAt: null, changes: 0 });
      return "created";
    },
    async requeueStale(before, max, now) {
      let requeued = 0;
      let failed = 0;
      for (const r of rows) {
        if (r.status !== "running" || !r.claimedAt || r.claimedAt >= before) continue;
        if (r.attempts >= max) (r.status = "failed"), (r.completedAt = now), failed++;
        else (r.status = "queued"), (r.claimedAt = null), (r.nextRetryAt = now), requeued++;
      }
      return { requeued, failed };
    },
    async claimNext(now, subscriptionId) {
      const r = rows.find((x) => x.status === "queued" && (!x.nextRetryAt || x.nextRetryAt <= now) && (!subscriptionId || x.subscriptionId === subscriptionId));
      if (!r) return null;
      r.status = "running";
      r.claimedAt = now;
      r.attempts += 1;
      return { ...r };
    },
    async previousSuccessful(scan) {
      return [...saved].reverse().find((s) => rows.find((r) => r.id === s.id)!.siteDomain === scan.siteDomain && s.id !== scan.id)?.prev ?? null;
    },
    async saveResult({ scan, result, diff, status, now }) {
      const r = rows.find((x) => x.id === scan.id)!;
      Object.assign(r, { status, savedPages: result.pages.length, diff: diff?.kind ?? null, completedAt: now, lastError: result.error, nextRetryAt: null, changes: diff?.changes.length ?? 0 });
      r.requests += result.requests;
      if (status === "completed" || status === "partial") {
        saved.push({
          id: scan.id,
          prev: {
            id: scan.id, scannerVersion: result.scannerVersion, completedAt: now, discoveredUrls: result.discoveredUrls, discoveryComplete: result.discoveryComplete,
            urls: result.pages.filter((p) => p.fetchStatus === "ok").map((p) => p.url),
            pages: result.pages.map((p) => ({ url: p.url, normalizedUrl: p.normalizedUrl, discoveredVia: p.discoveredVia, fetchStatus: p.fetchStatus, httpStatus: p.httpStatus, title: p.extracted?.title ?? null, metaDescription: p.extracted?.metaDescription ?? null, headings: p.extracted?.headings ?? { h1: [], h2: [], h3: [] }, contentBlocks: p.extracted?.contentBlocks ?? [], structuredData: p.extracted?.structuredData ?? null, identity: p.extracted?.identity ?? null, services: p.extracted?.services ?? [], locations: p.extracted?.locations ?? [] })),
          },
        });
      }
    },
    async scheduleRetry({ scan, result, error, nextRetryAt }) {
      const r = rows.find((x) => x.id === scan.id)!;
      Object.assign(r, { status: "queued", claimedAt: null, nextRetryAt, lastError: error });
      r.requests += result?.requests ?? 0;
    },
  };
  return { store, rows };
}

const target = (domain: string, kind: ScanTarget["siteKind"] = "customer"): ScanTarget => ({ siteKind: kind, siteDomain: domain, siteUrl: `https://${domain}/`, trackedCompetitorId: kind === "competitor" ? `c_${domain}` : null, label: domain });
const okSite: Record<string, FakeRoute> = { "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\n" }, "/": { status: 200, body: html({ title: "Home", h1: "Home", paragraphs: ["A home page with enough words to be captured as content."] }) } };
const limits = () => ({ maxPagesPerSite: WT.maxPagesPerSite, maxSitemapUrlsRead: WT.maxSitemapUrlsRead });
const deps = (routes: Record<string, Record<string, FakeRoute>>) => (scan: ClaimedScan) => ({ fetcher: fakeSite(routes[scan.siteDomain] ?? {}).fetcher, sleep: async () => {} });

(async () => {
  console.log("[website-jobs] running...");

  await h.check("enqueue is idempotent per (subscription, cycleKey, site)", async () => {
    const { store, rows } = memoryStore();
    const t = [target("a.example"), target("b.example", "competitor")];
    assert.deepEqual(await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k1", targets: t, now: T0 }), { created: 2, existing: 0 });
    assert.deepEqual(await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k1", targets: t, now: T0 }), { created: 0, existing: 2 });
    assert.equal(rows.length, 2);
  });

  await h.check("first run records a baseline; second compatible run compares; a finished scan is never re-run", async () => {
    const { store, rows } = memoryStore();
    await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k1", targets: [target("a.example")], now: T0 });
    const r1 = await runQueuedWebsiteScans({ store, limits, scanDeps: deps({ "a.example": okSite }), now: () => T0, maxScans: 5 });
    assert.equal(r1.outcomes[0]!.diff, "baseline");
    const again = await runQueuedWebsiteScans({ store, limits, scanDeps: deps({ "a.example": okSite }), now: () => T0, maxScans: 5 });
    assert.equal(again.outcomes.length, 0);
    await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k2", targets: [target("a.example")], now: T0 });
    const r2 = await runQueuedWebsiteScans({ store, limits, scanDeps: deps({ "a.example": okSite }), now: () => T0, maxScans: 5 });
    assert.equal(r2.outcomes[0]!.diff, "compared");
    assert.equal(r2.outcomes[0]!.changes, 0);
    assert.equal(rows.every((r) => r.status === "completed"), true);
  });

  await h.check("transient failure → re-queued with backoff, then failed after MAX_ATTEMPTS; no snapshot stored until terminal", async () => {
    const { store, rows } = memoryStore();
    await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k1", targets: [target("down.example")], now: T0 });
    const down = deps({ "down.example": { "/robots.txt": { status: 200, body: "" }, "/": "timeout" } });
    let now = T0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const r = await runQueuedWebsiteScans({ store, limits, scanDeps: down, now: () => now, maxScans: 1 });
      assert.equal(r.outcomes.length, 1, `attempt ${attempt} claimed`);
      if (attempt < MAX_ATTEMPTS) {
        assert.equal(r.outcomes[0]!.status, "queued");
        assert.equal(r.outcomes[0]!.retryAt!.getTime(), now.getTime() + BACKOFF_MS[attempt - 1]!);
        assert.equal(rows[0]!.savedPages, 0);
        const early = await runQueuedWebsiteScans({ store, limits, scanDeps: down, now: () => now, maxScans: 1 });
        assert.equal(early.outcomes.length, 0, "not retried before nextRetryAt");
        now = r.outcomes[0]!.retryAt!;
      } else {
        assert.equal(r.outcomes[0]!.status, "failed");
      }
    }
    assert.equal(rows[0]!.status, "failed");
    assert.equal(rows[0]!.attempts, MAX_ATTEMPTS);
  });

  await h.check("access restrictions and robots disallow are terminal on the first attempt (never retried or bypassed)", async () => {
    const { store, rows } = memoryStore();
    await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k1", targets: [target("denied.example"), target("closed.example")], now: T0 });
    const r = await runQueuedWebsiteScans({
      store,
      limits,
      scanDeps: deps({ "denied.example": { "/robots.txt": { status: 404 }, "/": { status: 403 } }, "closed.example": { "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" } } }),
      now: () => T0,
      maxScans: 5,
    });
    assert.deepEqual(r.outcomes.map((o) => o.status).sort(), ["blocked", "failed"]);
    assert.ok(rows.every((x) => x.attempts === 1 && x.nextRetryAt === null));
  });

  await h.check("a scan stuck running past STALE_MS is re-queued; out of attempts → failed", async () => {
    const { store, rows } = memoryStore();
    await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k1", targets: [target("a.example"), target("b.example")], now: T0 });
    await store.claimNext(T0);
    await store.claimNext(T0);
    rows[1]!.attempts = MAX_ATTEMPTS;
    const later = new Date(T0.getTime() + STALE_MS + 1);
    const r = await runQueuedWebsiteScans({ store, limits, scanDeps: deps({ "a.example": okSite }), now: () => later, maxScans: 5 });
    assert.deepEqual(r.stale, { requeued: 1, failed: 1 });
    assert.equal(rows[0]!.status, "completed");
    assert.equal(rows[1]!.status, "failed");
  });

  await h.check("one site's crash doesn't stop the other sites in the same run", async () => {
    const { store, rows } = memoryStore();
    await enqueueWebsiteScans({ store, subscriptionId: "s1", cycleKey: "k1", targets: [target("boom.example"), target("a.example")], now: T0 });
    const r = await runQueuedWebsiteScans({
      store,
      limits,
      scanDeps: (scan) => (scan.siteDomain === "boom.example" ? { fetcher: async () => { throw new Error("kaboom"); }, sleep: async () => {} } : deps({ "a.example": okSite })(scan)),
      now: () => T0,
      maxScans: 5,
    });
    assert.equal(r.outcomes.length, 2);
    assert.equal(rows.find((x) => x.siteDomain === "a.example")!.status, "completed");
    assert.equal(rows.find((x) => x.siteDomain === "boom.example")!.status, "queued", "crash is retryable");
  });

  await h.check("scheduler: website enqueue failure never blocks the re-audit or question tracking", async () => {
    const mstore = createFakeStore();
    mstore.subs.set("sub_x", {
      id: "sub_x", accessToken: "t", planKey: "monitoring_monthly", stripePriceId: null, stripeSubscriptionId: "stripe_x", priorStripeSubscriptionIds: [], customerId: null, stripeCustomerId: null, stripeCheckoutSessionId: null,
      status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: new Date(T0.getTime() + 30 * 86400000), canceledAt: null, endedAt: null, lastSyncedAt: T0,
      websiteUrl: "https://a.example", businessName: "A", email: "a@a.example", businessId: null, baselineAuditOrderId: null, cadenceDays: 30, nextAuditAt: T0, lastAuditQueuedAt: null, welcomeEmailSentAt: null, createdAt: T0,
    } as never);
    let tracked = 0;
    const r = await runMonitoringSchedulerTick({
      store: mstore,
      now: () => T0,
      env: { GEO_MODULE_MONITORING_ENABLED: "true" },
      runTrackingCycle: async () => void tracked++,
      enqueueWebsiteScans: async () => { throw new Error("db down"); },
    });
    assert.equal(r.outcome, "ran");
    assert.equal(r.outcome === "ran" && r.queued.length, 1);
    assert.equal(r.outcome === "ran" && r.websiteErrors.length, 1);
    assert.equal(tracked, 1);
    assert.equal(mstore.orders.length, 1);
  });

  await h.check("targets: customer + only competitors with a CONFIRMED website, capped by the plan", () => {
    const c = (id: string, domain: string | null, confirmed: boolean) => ({ id, name: id, websiteUrl: domain ? `https://${domain}/` : null, domain, domainConfirmedAt: confirmed ? T0 : null, isActive: true });
    const { targets, skipped } = scanTargets({
      customer: { websiteUrl: "https://www.columbus-hvac.com/", businessName: "Columbus Heating & Cooling" },
      competitors: [c("Detected Co", null, false), c("Unconfirmed", "unconfirmed.example", false), c("Logan", "logan-inc.com", true), c("Right Way", "rightwayhvac.com", true), c("Westin", "westinair.com", true), c("Fourth", "fourth.example", true)],
      entitlement: WT,
    });
    assert.deepEqual(targets.map((t) => t.siteDomain), ["columbus-hvac.com", "logan-inc.com", "rightwayhvac.com", "westinair.com"]);
    assert.equal(targets[0]!.siteKind, "customer");
    assert.deepEqual(skipped.map((s) => s.reason), ["no confirmed website", "no confirmed website", "plan limit"]);
    assert.equal(scanTargets({ customer: { websiteUrl: "https://a.example", businessName: null }, competitors: [], entitlement: { ...WT, enabled: false } }).targets.length, 0);
  });

  await h.check("competitor website validation: public address only, not the customer's own, no duplicates", () => {
    const base = { customerWebsiteUrl: "https://www.columbus-hvac.com", otherCompetitorDomains: ["logan-inc.com"] };
    assert.deepEqual(decideCompetitorWebsite({ ...base, websiteUrl: "westinair.com" }), { ok: true, websiteUrl: "https://westinair.com/", domain: "westinair.com" });
    for (const bad of ["http://127.0.0.1", "http://localhost:3000", "https://user:pw@x.example", "columbus-hvac.com", "https://www.logan-inc.com/about", "not a url", ""]) {
      assert.equal(decideCompetitorWebsite({ ...base, websiteUrl: bad }).ok, false, bad);
    }
  });

  await h.check("entitlements: Early Access limits are read from the plan", () => {
    assert.deepEqual(WT, { enabled: true, maxPagesPerSite: 12, maxSitemapUrlsRead: 200, maxCompetitorSites: 3 });
  });

  await h.check("routes: website edits go through the signed-in, owner-checked, flag-gated tracking route; the page loads website data only after the ownership check", () => {
    const route = readFileSync("src/app/api/monitoring/tracking/route.ts", "utf8");
    assert.match(route, /case "set_competitor_website"/);
    assert.ok(route.indexOf("requireOwnedSubscription(") > 0);
    assert.ok(route.indexOf("requireOwnedSubscription(") < route.indexOf("setCompetitorWebsite("));
    const page = readFileSync("src/app/(future)/monitoring/account/[subscriptionId]/page.tsx", "utf8");
    assert.ok(page.indexOf("requireOwnedSubscription(") > 0);
    assert.ok(page.indexOf("requireOwnedSubscription(") < page.indexOf("loadWebsiteDashboard(sub)"));
    const svc = readFileSync("src/lib/monitoring/website/service.ts", "utf8");
    assert.match(svc, /setCompetitorWebsite[\s\S]*?canEditTracking\(sub\)/, "edits require an active subscription");
  });

  await h.check("findings cite page, date, and excerpt; competitor items are opportunities; no causation language", () => {
    const at = new Date("2026-10-02T00:00:00Z");
    const ch = (o: Partial<ChangeForFindings>): ChangeForFindings => ({ id: "x", siteKind: "customer", siteDomain: "a.example", siteLabel: "A", changeType: "page_removed", url: "https://a.example/x", beforeExcerpt: "Old page", afterExcerpt: null, detail: {}, toFetchedAt: at, ...o });
    const f = websiteFindings({
      changes: [
        ch({ changeType: "schema_changed", detail: { localBusinessBefore: true, localBusinessAfter: false }, beforeExcerpt: "HVACBusiness", afterExcerpt: "no structured data" }),
        ch({ changeType: "page_removed", detail: { httpStatus: 404 } }),
        ch({ changeType: "identity_changed", detail: { fields: ["phone"] }, beforeExcerpt: "phone: 555-0100", afterExcerpt: "phone: 555-0199" }),
        ch({ siteKind: "competitor", siteDomain: "logan-inc.com", siteLabel: "Logan Services", changeType: "page_added", url: "https://logan-inc.com/heat-pumps", afterExcerpt: "Heat Pump Installation", detail: { h1: ["Heat Pump Installation"], services: [], locations: [] } }),
        ch({ siteKind: "competitor", siteDomain: "logan-inc.com", siteLabel: "Logan Services", changeType: "page_added", url: "https://logan-inc.com/furnace", afterExcerpt: "Furnace Repair", detail: { h1: ["Furnace Repair"] } }),
      ],
      customerTopics: ["Furnace Repair Columbus"],
    });
    assert.deepEqual(f.map((x) => x.category), ["structured_data", "website_content", "business_identity", "local_visibility"]);
    for (const x of f) {
      assert.equal(x.source, "website");
      assert.ok(x.url && x.evidence.includes("2026-10-02"), x.id);
      assert.doesNotMatch(`${x.title} ${x.action} ${x.evidence}`, /caus|because of|led to|guarantee/i);
    }
    assert.match(f[3]!.action, /opportunity/);
    const recs = buildRecommendations({ audit: null, metrics: null, citations: null, detectedCompetitors: [], customerName: "A", websiteFindings: f });
    assert.ok(recs.some((r) => r.source === "website" && r.priority === 1));
  });

  h.done();
})();
