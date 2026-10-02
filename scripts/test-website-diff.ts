/* eslint-disable no-console */
/**
 * scripts/test-website-diff.ts — change detection between two scans:
 * every change type, confirmed removal vs. couldn't-check, baseline,
 * scanner-version incompatibility, and noise that must not be reported.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { fakeSite, noSleep, type FakeRoute } from "./lib/website-fakes";
import { FIXTURE_V1 as v1, FIXTURE_V2 as v2, longText } from "./lib/website-fixture-site";
import { contentSimilarity, diffScans, MATERIAL_MIN_CHARS, type ScanForDiff } from "../src/lib/monitoring/website/diff";
import { scanSite } from "../src/lib/monitoring/website/scanner";

const h = harness("website-diff");
const limits = { maxPagesPerSite: 8, maxSitemapUrlsRead: 50 };
async function scan(routes: Record<string, FakeRoute>, id: string, previous: ScanForDiff & { urls?: string[] } | null, scannerVersion?: string): Promise<ScanForDiff & { urls: string[] }> {
  const r = await scanSite({ siteUrl: "https://fixture-hvac.example", limits, previousUrls: previous?.urls ?? [] }, { fetcher: fakeSite(routes).fetcher, ...noSleep });
  return {
    id,
    scannerVersion: scannerVersion ?? r.scannerVersion,
    completedAt: new Date(id === "s1" ? "2026-10-01T00:00:00Z" : "2026-10-02T00:00:00Z"),
    discoveredUrls: r.discoveredUrls,
    discoveryComplete: r.discoveryComplete,
    urls: r.pages.filter((p) => p.fetchStatus === "ok").map((p) => p.url),
    pages: r.pages.map((p) => ({
      url: p.url, normalizedUrl: p.normalizedUrl, discoveredVia: p.discoveredVia, fetchStatus: p.fetchStatus, httpStatus: p.httpStatus,
      title: p.extracted?.title ?? null, metaDescription: p.extracted?.metaDescription ?? null, headings: p.extracted?.headings ?? { h1: [], h2: [], h3: [] },
      contentBlocks: p.extracted?.contentBlocks ?? [], structuredData: p.extracted?.structuredData ?? null, identity: p.extracted?.identity ?? null,
      services: p.extracted?.services ?? [], locations: p.extracted?.locations ?? [],
    })),
  };
}

(async () => {
  console.log("[website-diff] running...");
  const s1 = await scan(v1, "s1", null);

  await h.check("first scan is a baseline with no changes", () => {
    const d = diffScans(null, s1);
    assert.equal(d.kind, "baseline");
    assert.equal(d.changes.length, 0);
  });

  await h.check("re-scanning an unchanged site (plus nav/footer/date noise) reports nothing", async () => {
    const noisy = { ...v1, "/": { status: 200, body: (v1["/"] as { body: string }).body.replace("© 2025", "© 2026 · updated Oct 9, 2026") } };
    const d = diffScans(s1, await scan(noisy, "s2", s1));
    assert.equal(d.kind, "compared");
    assert.deepEqual(d.changes, []);
  });

  const s2 = await scan(v2, "s2", s1);
  const d = diffScans(s1, s2);
  const types = (t: string) => d.changes.filter((c) => c.changeType === t);

  await h.check("new page, title change, phone change, material content change are all detected with excerpts", () => {
    const added = types("page_added");
    assert.equal(added.length, 1);
    assert.equal(added[0]!.url, "https://fixture-hvac.example/services/heat-pumps");
    assert.equal(added[0]!.afterExcerpt, "Heat Pump Installation");
    const title = types("title_changed")[0]!;
    assert.equal(title.beforeExcerpt, "Fixture HVAC | Columbus");
    assert.equal(title.afterExcerpt, "Fixture HVAC | Columbus & Dublin HVAC");
    const id = types("identity_changed")[0]!;
    assert.deepEqual((id.detail as { fields: string[] }).fields, ["phone"]);
    assert.match(id.beforeExcerpt!, /555-0100/);
    assert.match(id.afterExcerpt!, /555-0199/);
    const schema = types("schema_changed").find((c) => c.url.endsWith("/about"))!;
    assert.ok(schema, "removed LocalBusiness on /about");
    assert.equal((schema.detail as { localBusinessAfter: boolean }).localBusinessAfter, false);
    const content = types("content_changed")[0]!;
    assert.equal(content.url, "https://fixture-hvac.example/services/furnace-repair");
    assert.ok(content.beforeExcerpt && content.afterExcerpt && content.beforeExcerpt.length <= 300);
  });

  await h.check("a 404 on direct re-check is a confirmed removal; a timeout is couldn't-check, never removed", () => {
    const removed = types("page_removed");
    assert.equal(removed.length, 1);
    assert.equal(removed[0]!.url, "https://fixture-hvac.example/services/duct-cleaning");
    assert.ok(!d.changes.some((c) => c.url.endsWith("/services/boiler")), "timeout page produces no change");
    assert.ok(d.uncheckable.some((u) => u.url.endsWith("/services/boiler") && u.fetchStatus === "timeout"));
    assert.ok(!d.uncheckable.some((u) => u.url.endsWith("/duct-cleaning")), "confirmed removal is not listed as uncheckable");
  });

  await h.check("nav anchor text and footer date changes are not reported", () => {
    assert.ok(!d.changes.some((c) => /about us|© 2026|oct 2/i.test(`${c.beforeExcerpt} ${c.afterExcerpt}`)));
    assert.equal(types("headings_changed").length, 0);
    assert.equal(types("description_changed").length, 0);
  });

  await h.check("removed LocalBusiness schema is reported as a schema change", async () => {
    const noSchema = { ...v1, "/": { status: 200, body: (v1["/"] as { body: string }).body.replace(/<script type="application\/ld\+json">.*?<\/script>/s, "") } };
    const dd = diffScans(s1, await scan(noSchema, "s3", s1));
    const sc = dd.changes.find((c) => c.changeType === "schema_changed")!;
    assert.ok(sc);
    assert.equal((sc.detail as { localBusinessBefore: boolean }).localBusinessBefore, true);
    assert.equal((sc.detail as { localBusinessAfter: boolean }).localBusinessAfter, false);
    assert.equal(sc.afterExcerpt, "no structured data");
  });

  await h.check("a scanner MAJOR version change re-records the baseline instead of comparing", async () => {
    const s9 = await scan(v2, "s2", s1, "site-scanner@2.0.0");
    const dd = diffScans(s1, s9);
    assert.equal(dd.kind, "baseline_rerecorded");
    assert.equal(dd.changes.length, 0);
    assert.equal(diffScans(s1, { ...s2, scannerVersion: "site-scanner@1.4.0" }).kind, "compared");
  });

  await h.check("small edits stay below the material threshold", () => {
    const before = longText("Furnace repair");
    const after = [...before.slice(0, 5), `${before[5]} Call today.`];
    const s = contentSimilarity(before, after);
    assert.ok(s.similarity >= 0.85 || s.changedChars < MATERIAL_MIN_CHARS, `similarity ${s.similarity}, changed ${s.changedChars}`);
    const dd = diffScans(s1, { ...s1, id: "s4", pages: s1.pages.map((p) => (p.url.endsWith("/furnace-repair") ? { ...p, contentBlocks: after } : p)) });
    assert.equal(dd.changes.filter((c) => c.changeType === "content_changed").length, 0);
  });

  await h.check("additions are not claimed when the previous scan's discovery was incomplete", () => {
    const dd = diffScans({ ...s1, discoveryComplete: false }, s2);
    assert.equal(dd.changes.filter((c) => c.changeType === "page_added").length, 0);
  });

  h.done();
})();
