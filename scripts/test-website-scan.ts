/* eslint-disable no-console */
/**
 * scripts/test-website-scan.ts — bounded discovery, robots enforcement,
 * politeness, failure classification, and noise-filtered extraction.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { fakeSite, html, noSleep } from "./lib/website-fakes";
import { parseSitemap, planPages } from "../src/lib/monitoring/website/discover";
import { extractPage } from "../src/lib/monitoring/website/extract";
import { scanSite } from "../src/lib/monitoring/website/scanner";

const h = harness("website-scan");
const limits = { maxPagesPerSite: 5, maxSitemapUrlsRead: 200 };
const home = html({
  title: "Acme HVAC | Columbus, OH",
  h1: "Heating & cooling in Columbus",
  nav: [["/about-us", "About"], ["/services/furnace-repair", "Furnace Repair"], ["/blog/news", "News"], ["https://facebook.com/acme", "Facebook"], ["/contact", "Contact"]],
  paragraphs: ["Acme HVAC has served Columbus homeowners with furnace and air conditioning repair since 1998."],
});
const page = (t: string) => html({ title: t, h1: t, paragraphs: [`${t} details for homeowners across central Ohio and nearby suburbs.`] });

(async () => {
  console.log("[website-scan] running...");

  await h.check("discovers homepage + about/service links + sitemap pages, capped at maxPagesPerSite", async () => {
    const locs = Array.from({ length: 30 }, (_, i) => `<url><loc>https://acme.example/services/s${i}</loc></url>`).join("");
    const { fetcher, requested } = fakeSite({
      "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\n" },
      "/": { status: 200, body: home },
      "/sitemap.xml": { status: 200, body: `<urlset>${locs}</urlset>`, contentType: "application/xml" },
      "/about-us": { status: 200, body: page("About Acme") },
      "/services/furnace-repair": { status: 200, body: page("Furnace Repair") },
      ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`/services/s${i}`, { status: 200, body: page(`Service ${i}`) }])),
    });
    const r = await scanSite({ siteUrl: "https://acme.example", limits }, { fetcher, ...noSleep });
    assert.equal(r.status, "completed");
    assert.equal(r.pages.length, 5);
    assert.equal(r.pages[0]!.discoveredVia, "homepage");
    const urls = r.pages.map((p) => p.url);
    assert.ok(urls.includes("https://acme.example/about-us"));
    assert.ok(urls.includes("https://acme.example/services/furnace-repair"));
    assert.ok(!urls.some((u) => u.includes("facebook") || u.includes("/blog/") || u.includes("/contact")));
    assert.ok(requested.length <= 1 + 1 + 1 + 4, `bounded requests (${requested.length})`);
    assert.equal(r.discoveryComplete, true);
    assert.ok(r.discoveredUrls.length >= 30);
  });

  await h.check("sitemap index: one level, child sitemaps capped; locs capped at maxSitemapUrlsRead", async () => {
    const idx = `<sitemapindex>${["page", "post", "a", "b", "c"].map((n) => `<sitemap><loc>https://acme.example/${n}-sitemap.xml</loc></sitemap>`).join("")}</sitemapindex>`;
    const child = (n: string) => `<urlset>${Array.from({ length: 50 }, (_, i) => `<url><loc>https://acme.example/${n}/${i}</loc></url>`).join("")}</urlset>`;
    const { fetcher, requested } = fakeSite({
      "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\nSitemap: https://acme.example/sitemap_index.xml\n" },
      "/": { status: 200, body: home },
      "/sitemap_index.xml": { status: 200, body: idx },
      ...Object.fromEntries(["page", "post", "a", "b", "c"].map((n) => [`/${n}-sitemap.xml`, { status: 200, body: child(n) }])),
    });
    const r = await scanSite({ siteUrl: "https://acme.example", limits: { maxPagesPerSite: 3, maxSitemapUrlsRead: 80 } }, { fetcher, ...noSleep });
    const sitemapFetches = requested.filter((u) => u.endsWith(".xml"));
    assert.ok(sitemapFetches.length <= 1 + 3, "index + at most 3 children");
    assert.ok(sitemapFetches[1]!.includes("page-sitemap"), "page-like child first");
    assert.ok(r.discoveredUrls.length <= 80 + 5);
    assert.ok(parseSitemap(child("x"), 10).locs.length === 10);
  });

  await h.check("robots-disallowed pages are recorded as blocked_robots and never requested", async () => {
    const { fetcher, requested } = fakeSite({
      "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /services/\n" },
      "/": { status: 200, body: home },
      "/about-us": { status: 200, body: page("About") },
    });
    const r = await scanSite({ siteUrl: "https://acme.example", limits }, { fetcher, ...noSleep });
    const blocked = r.pages.filter((p) => p.fetchStatus === "blocked_robots");
    assert.ok(blocked.length >= 1);
    assert.ok(!requested.some((u) => u.includes("/services/")));
    assert.equal(r.status, "partial");
  });

  await h.check("robots.txt Disallow: / blocks the whole scan without fetching the homepage", async () => {
    const { fetcher, requested } = fakeSite({ "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" }, "/": { status: 200, body: home } });
    const r = await scanSite({ siteUrl: "https://acme.example", limits }, { fetcher, ...noSleep });
    assert.equal(r.status, "blocked");
    assert.equal(r.retryable, false);
    assert.deepEqual(requested, ["https://acme.example/robots.txt"]);
  });

  await h.check("robots.txt 5xx stops the scan (retryable); 404 means no restrictions", async () => {
    const down = await scanSite({ siteUrl: "https://acme.example", limits }, { fetcher: fakeSite({ "/robots.txt": { status: 503 }, "/": { status: 200, body: home } }).fetcher, ...noSleep });
    assert.equal(down.status, "blocked");
    assert.equal(down.retryable, true);
    assert.equal(down.pages.length, 0);
    const none = await scanSite({ siteUrl: "https://acme.example", limits }, { fetcher: fakeSite({ "/": { status: 200, body: home } }).fetcher, ...noSleep });
    assert.notEqual(none.status, "blocked");
    assert.equal(none.robotsOutcome, "none (4xx)");
  });

  await h.check("homepage 403 → failed, not retryable (access restriction respected); timeout → retryable", async () => {
    const denied = await scanSite({ siteUrl: "https://acme.example", limits }, { fetcher: fakeSite({ "/": { status: 403 } }).fetcher, ...noSleep });
    assert.equal(denied.status, "failed");
    assert.equal(denied.retryable, false);
    assert.equal(denied.pages[0]!.fetchStatus, "access_denied");
    const slow = await scanSite({ siteUrl: "https://acme.example", limits }, { fetcher: fakeSite({ "/": "timeout" }).fetcher, ...noSleep });
    assert.equal(slow.retryable, true);
  });

  await h.check("requests to one site are spaced by at least 500 ms (Crawl-delay honored)", async () => {
    let clock = 0;
    const waits: number[] = [];
    const { fetcher } = fakeSite({ "/robots.txt": { status: 200, body: "User-agent: *\nCrawl-delay: 2\n" }, "/": { status: 200, body: home }, "/about-us": { status: 200, body: page("About") } });
    await scanSite(
      { siteUrl: "https://acme.example", limits: { maxPagesPerSite: 2, maxSitemapUrlsRead: 10 } },
      { fetcher, now: () => new Date(clock), sleep: async (ms) => { waits.push(ms); clock += ms; } },
    );
    assert.ok(waits.length >= 2);
    assert.ok(waits.every((w) => w >= 2000 && w <= 5000), JSON.stringify(waits));
  });

  await h.check("previously captured pages are re-checked; slots stay open for new pages", () => {
    const plan = planPages({
      homepage: "https://a.example/",
      nav: ["https://a.example/new1", "https://a.example/old1"],
      sitemap: ["https://a.example/new2"],
      previous: ["https://a.example/", "https://a.example/old1", "https://a.example/old2", "https://a.example/old3", "https://a.example/old4"],
      maxPages: 4,
      reserveNew: 2,
    });
    assert.equal(plan.length, 4);
    assert.equal(plan.filter((p) => p.url.includes("new")).length, 2);
    assert.ok(plan.some((p) => p.via === "recheck" || p.url.includes("old1")));
  });

  await h.check("extraction: nav/footer/copyright/date/time/relative-time noise does not change the fingerprint", () => {
    const body = (when: string, ago: string) => ({
      title: "Furnace Repair",
      h1: "Furnace Repair",
      paragraphs: [
        "We repair every make of gas and electric furnace in Columbus within one business day.",
        `Seasonal tune-up pricing is valid through ${when} for every Columbus homeowner.`,
        `Reviews refreshed ${ago} from customers across Franklin County.`,
      ],
    });
    const a = extractPage(html({ ...body("October 1, 2026 at 10:15 am", "3 days ago"), nav: [["/a", "A"]], footer: "© 2025 Acme" }), "https://a.example/services/furnace");
    const b = extractPage(html({ ...body("Nov 5, 2026 at 9:00 pm", "2 hours ago"), nav: [["/a", "A"], ["/b", "B new nav"]], footer: "© 2026 Acme. Updated 2026-10-02" }), "https://a.example/services/furnace");
    assert.equal(a.contentBlocks.length, 3, "nav/footer text excluded from content");
    assert.equal(b.contentFingerprint, a.contentFingerprint);
    const c = extractPage(html({ ...body("October 1, 2026", "3 days ago"), paragraphs: ["We now also install heat pumps and ductless mini-splits across Columbus."] }), "https://a.example/services/furnace");
    assert.notEqual(c.contentFingerprint, a.contentFingerprint, "real text changes do change it");
  });

  await h.check("extraction: title, description, canonical, headings, JSON-LD identity, services, locations", () => {
    const p = extractPage(
      `<html><head><title>AC Repair | Acme</title><meta name="description" content="Fast AC repair."><link rel="canonical" href="/services/ac">
      <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "HVACBusiness", name: "Acme HVAC", telephone: "(614) 555-0100", address: { streetAddress: "1 Main St", addressLocality: "Columbus", addressRegion: "OH" }, areaServed: ["Columbus", "Dublin"] })}</script>
      </head><body><main><h1>AC Repair in Dublin, OH</h1><h2>Same-day service</h2><p>Air conditioner repair for homes across the Columbus area, any brand.</p></main></body></html>`,
      "https://acme.example/services/ac",
    );
    assert.equal(p.title, "AC Repair | Acme");
    assert.equal(p.metaDescription, "Fast AC repair.");
    assert.equal(p.canonicalUrl, "https://acme.example/services/ac");
    assert.deepEqual(p.headings.h1, ["AC Repair in Dublin, OH"]);
    assert.equal(p.identity.name, "Acme HVAC");
    assert.equal(p.identity.phone, "(614) 555-0100");
    assert.ok(p.structuredData.types.includes("HVACBusiness"));
    assert.ok(p.structuredData.localBusiness);
    assert.ok(p.locations.includes("Columbus") && p.locations.includes("Dublin, OH"));
    assert.ok(p.services.includes("AC Repair in Dublin, OH"));
  });

  h.done();
})();
