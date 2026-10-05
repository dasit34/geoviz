/* eslint-disable no-console */
/**
 * scripts/test-free-check-safe-fetch.ts
 *
 * DB-free tests for the public /check route's SSRF-safe website retrieval
 * (src/lib/free-check/safe-html-fetcher.ts + src/app/api/free-check/route.ts).
 *
 * Literal private / local targets go through the REAL route handler (they are
 * refused before any DNS lookup, so no network is touched). DNS-dependent and
 * redirect cases use the route's exact fetcher composition
 * (`createSafeHtmlFetcher(url, CHECK_ROUTE_FETCH_OPTIONS)`) with a fake
 * resolver + transport under the real `safeFetch`.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { runFreeCheck } from "../src/lib/free-check/runFreeCheck";
import { CHECK_ROUTE_FETCH_OPTIONS, createSafeHtmlFetcher } from "../src/lib/free-check/safe-html-fetcher";
import type { FetchRawHtmlResult } from "../src/lib/intelligence/preflight/fetchRawHtml";
import type { Resolver, Transport } from "../src/lib/monitoring/website/safe-fetch";
import { POST } from "../src/app/api/free-check/route";

let passed = 0;
let failed = 0;
const failures: string[] = [];
async function check(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

// ── Fake network under the real safeFetch ──────────────────────────────
type Route = { status: number; body?: string; contentType?: string; location?: string; truncated?: boolean } | "timeout";
const PUBLIC_IP = "93.184.216.34";
const PAGE = (name: string) => `<!doctype html><html><head><title>${name} | Denver HVAC</title>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "HVACBusiness", name, telephone: "+1-303-555-0100", url: "https://example/", address: { "@type": "PostalAddress", streetAddress: "1 Main St", addressLocality: "Denver" } })}</script>
</head><body><main><h1>${name} — heating and cooling in Denver, CO</h1>${`<p>${name} repairs furnaces and air conditioners across Denver, Colorado. Call +1-303-555-0100.</p>`.repeat(10)}</main>
<footer>${name} · 1 Main St, Denver, CO · +1-303-555-0100</footer></body></html>`;

function fakeNet(dns: Record<string, string>, routes: Record<string, Route>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const resolver: Resolver = async (host) => {
    const ip = dns[host];
    if (!ip) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return [{ address: ip, family: ip.includes(":") ? 6 : 4 }];
  };
  const transport: Transport = async (url, opts) => {
    calls.push({ url: url.toString(), headers: opts.headers });
    const r = routes[url.toString()] ?? { status: 404, body: "" };
    if (r === "timeout") throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    return { status: r.status, headers: { "content-type": r.contentType ?? "text/html; charset=utf-8", location: r.location }, body: Buffer.from(r.body ?? ""), truncated: Boolean(r.truncated) };
  };
  return { resolver, transport, calls };
}

const INPUT = (websiteUrl: string) => ({ websiteUrl, businessName: "Acme Heating", city: "Denver", state: "CO", category: "" });
async function checkVia(net: ReturnType<typeof fakeNet>, url: string) {
  const { fetcher, homepageOutcome } = createSafeHtmlFetcher(url, { ...CHECK_ROUTE_FETCH_OPTIONS, resolver: net.resolver, transport: net.transport });
  const result = await runFreeCheck(INPUT(url), { fetcher });
  return { result, outcome: homepageOutcome() };
}

// ── Real route handler ─────────────────────────────────────────────────
let ipN = 0;
async function postCheck(websiteUrl: string) {
  ipN += 1;
  const req = new Request("https://preview.example/api/free-check", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipN}` },
    body: JSON.stringify({ websiteUrl, businessName: "Acme Heating", email: "owner@example.com", city: "", state: "", category: "" }),
  });
  const res = await POST(req as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const logs: string[] = [];
for (const m of ["info", "warn", "error"] as const) {
  console[m] = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
}

async function main() {
  console.log("\n/check — SSRF-safe website retrieval\n");

  // ── Valid public websites ──
  await check("valid public website: v1.3 result, same score as the analyzers on the same bytes", async () => {
    const page = PAGE("Acme Heating");
    const net = fakeNet({ "acmeheating.example": PUBLIC_IP }, {
      "https://acmeheating.example/": { status: 200, body: page },
      "https://acmeheating.example/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\n", contentType: "text/plain" },
      "https://acmeheating.example/sitemap.xml": { status: 200, body: "<?xml version=\"1.0\"?><urlset></urlset>", contentType: "application/xml" },
    });
    const { result } = await checkVia(net, "https://acmeheating.example/");
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.scoringVersion, "free-check-v1.3");
    assert.equal(result.businessType, "local");
    const plainBytes: Record<string, string> = { "https://acmeheating.example/": page, "https://acmeheating.example/robots.txt": "User-agent: *\nAllow: /\n", "https://acmeheating.example/sitemap.xml": "<?xml version=\"1.0\"?><urlset></urlset>" };
    const plain = async (u: string): Promise<FetchRawHtmlResult> => ({ ok: true, html: plainBytes[u] ?? "", finalUrl: u, status: plainBytes[u] ? 200 : 404, contentType: "text/html" });
    const base = await runFreeCheck(INPUT("https://acmeheating.example/"), { fetcher: plain });
    assert.ok(base.ok);
    assert.equal(result.overallScore, base.overallScore);
    assert.deepEqual(result.checks, base.checks);
  });

  await check("request carries only User-Agent / Accept — no sec-fetch-mode or accept-language (Rick's shell trigger)", async () => {
    const net = fakeNet({ "headers.example": PUBLIC_IP }, { "https://headers.example/": { status: 200, body: PAGE("H") } });
    await checkVia(net, "https://headers.example/");
    const h = Object.fromEntries(Object.entries(net.calls[0]!.headers).map(([k, v]) => [k.toLowerCase(), v]));
    assert.ok(!("sec-fetch-mode" in h) && !("accept-language" in h), JSON.stringify(h));
    assert.match(h["user-agent"] ?? "", /GeoVizSiteScanner/);
  });

  await check("homepage 404 / 500 is reported as unreachable (502), not scored", async () => {
    for (const status of [404, 500]) {
      const net = fakeNet({ "down.example": PUBLIC_IP }, { "https://down.example/": { status, body: "error page" } });
      const { result } = await checkVia(net, "https://down.example/");
      assert.ok(!result.ok);
      if (!result.ok) assert.equal(result.status, 502);
    }
  });

  await check("timeout keeps the existing 504 'took too long' message", async () => {
    const net = fakeNet({ "slow.example": PUBLIC_IP }, { "https://slow.example/": "timeout" });
    const { result } = await checkVia(net, "https://slow.example/");
    assert.ok(!result.ok);
    if (!result.ok) {
      assert.equal(result.status, 504);
      assert.match(result.error, /took too long/);
    }
  });

  await check("homepage over the 5 MB cap is refused", async () => {
    const net = fakeNet({ "huge.example": PUBLIC_IP }, { "https://huge.example/": { status: 200, body: "x", truncated: true } });
    const { result, outcome } = await checkVia(net, "https://huge.example/");
    assert.ok(!result.ok);
    assert.deepEqual(outcome, { kind: "too_large" });
    assert.equal(CHECK_ROUTE_FETCH_OPTIONS.homepageMaxBytes, 5_000_000);
  });

  // ── Invalid URLs (real route) ──
  for (const bad of ["ftp://example.com/", "https://user:pass@example.com/", "https://example.com:8080/", "https://intranet/"]) {
    await check(`invalid URL refused by the route with the generic message: ${bad}`, async () => {
      const { status, body } = await postCheck(bad);
      assert.ok(status === 400 || status === 502, `status ${status}`);
      assert.ok(typeof body.error === "string");
      assert.ok(!/stack|Error:|ECONN|resolve/i.test(String(body.error)), String(body.error));
    });
  }
  await check("garbage input is rejected by validation (400)", async () => {
    const { status } = await postCheck("not a url at all");
    assert.equal(status, 400);
  });

  // ── Private / local / metadata addresses (real route, no network) ──
  for (const target of ["http://127.0.0.1/", "http://10.0.0.1/", "http://192.168.1.1/", "http://172.16.0.5/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[fd00::1]/", "http://[::ffff:169.254.169.254]/", "http://localhost/", "http://metadata.google.internal/", "http://100.100.100.200/"]) {
    await check(`private/metadata target blocked by the route: ${target}`, async () => {
      const { status, body } = await postCheck(target);
      assert.equal(status, 502);
      assert.match(String(body.error), /couldn't reach this website/);
    });
  }

  await check("public hostname that resolves to a private / metadata IP is blocked before any request", async () => {
    for (const ip of ["10.1.2.3", "169.254.169.254", "127.0.0.1", "fd12::1"]) {
      const net = fakeNet({ "sneaky.example": ip }, {});
      const { result, outcome } = await checkVia(net, "https://sneaky.example/");
      assert.ok(!result.ok);
      assert.deepEqual(outcome, { kind: "blocked_unsafe" });
      assert.equal(net.calls.length, 0);
    }
  });

  // ── Redirects ──
  await check("same-site redirect (apex → www) is followed", async () => {
    const net = fakeNet({ "brand.example": PUBLIC_IP, "www.brand.example": PUBLIC_IP }, {
      "https://brand.example/": { status: 301, location: "https://www.brand.example/" },
      "https://www.brand.example/": { status: 200, body: PAGE("Brand") },
    });
    const { result } = await checkVia(net, "https://brand.example/");
    assert.ok(result.ok);
  });

  await check("cross-site redirect to a public site is followed (current /check behavior), robots.txt from the new site", async () => {
    const net = fakeNet({ "old-brand.example": PUBLIC_IP, "newbrand.example": PUBLIC_IP }, {
      "https://old-brand.example/": { status: 301, location: "https://newbrand.example/" },
      "https://newbrand.example/": { status: 200, body: PAGE("New Brand") },
      "https://newbrand.example/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\n", contentType: "text/plain" },
    });
    const { result } = await checkVia(net, "https://old-brand.example/");
    assert.ok(result.ok, JSON.stringify(result));
    assert.ok(net.calls.some((c) => c.url === "https://newbrand.example/robots.txt"));
    assert.ok(!net.calls.some((c) => c.url.startsWith("https://old-brand.example/robots")));
  });

  await check("redirect to a private / metadata IP literal is blocked (no request to it)", async () => {
    for (const loc of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:80/admin", "http://[::1]/", "http://10.0.0.7/"]) {
      const net = fakeNet({ "hop.example": PUBLIC_IP }, { "https://hop.example/": { status: 302, location: loc } });
      const { result, outcome } = await checkVia(net, "https://hop.example/");
      assert.ok(!result.ok, loc);
      assert.deepEqual(outcome, { kind: "blocked_unsafe" }, loc);
      assert.deepEqual(net.calls.map((c) => c.url), ["https://hop.example/"], loc);
    }
  });

  await check("redirect to a hostname that resolves privately is blocked (same-site and cross-site)", async () => {
    const same = fakeNet({ "rebind.example": PUBLIC_IP, "www.rebind.example": "10.0.0.9" }, { "https://rebind.example/": { status: 301, location: "https://www.rebind.example/" } });
    const r1 = await checkVia(same, "https://rebind.example/");
    assert.ok(!r1.result.ok);
    assert.deepEqual(r1.outcome, { kind: "blocked_unsafe" });
    const cross = fakeNet({ "start.example": PUBLIC_IP, "internal-looking.example": "192.168.0.10" }, { "https://start.example/": { status: 301, location: "https://internal-looking.example/" } });
    const r2 = await checkVia(cross, "https://start.example/");
    assert.ok(!r2.result.ok);
    assert.deepEqual(r2.outcome, { kind: "blocked_unsafe" });
    assert.deepEqual(cross.calls.map((c) => c.url), ["https://start.example/"]);
  });

  await check("redirect chains are capped at 3 hops in total (across sites)", async () => {
    const net = fakeNet({ "a.example": PUBLIC_IP, "b.example": PUBLIC_IP, "c.example": PUBLIC_IP, "d.example": PUBLIC_IP, "e.example": PUBLIC_IP }, {
      "https://a.example/": { status: 301, location: "https://b.example/" },
      "https://b.example/": { status: 301, location: "https://c.example/" },
      "https://c.example/": { status: 301, location: "https://d.example/" },
      "https://d.example/": { status: 301, location: "https://e.example/" },
      "https://e.example/": { status: 200, body: PAGE("E") },
    });
    const { result } = await checkVia(net, "https://a.example/");
    assert.ok(!result.ok);
    assert.ok(!net.calls.some((c) => c.url === "https://e.example/"), net.calls.map((c) => c.url).join(" → "));
  });

  await check("the ChatGPT tool keeps same-site-only redirects (default options)", async () => {
    const net = fakeNet({ "old-brand.example": PUBLIC_IP, "newbrand.example": PUBLIC_IP }, { "https://old-brand.example/": { status: 301, location: "https://newbrand.example/" } });
    const { fetcher, homepageOutcome } = createSafeHtmlFetcher("https://old-brand.example/", { resolver: net.resolver, transport: net.transport });
    const r = await runFreeCheck(INPUT("https://old-brand.example/"), { fetcher });
    assert.ok(!r.ok);
    assert.deepEqual(homepageOutcome(), { kind: "redirect_offsite" });
  });

  // ── Wiring ──
  await check("/api/free-check uses the safe fetcher with the /check options (no plain fetch path)", () => {
    const src = readFileSync(path.join(__dirname, "../src/app/api/free-check/route.ts"), "utf8");
    assert.match(src, /createSafeHtmlFetcher\(websiteUrl, CHECK_ROUTE_FETCH_OPTIONS\)/);
    assert.match(src, /runFreeCheck\(\s*\{[^}]*\},\s*\{ fetcher \},?\s*\)/);
    assert.ok(!/fetchRawHtml|\bfetch\(/.test(src));
  });

  await check("route logs never include the resolved IP or internal error details", () => {
    const joined = logs.join("\n");
    assert.ok(!/10\.1\.2\.3|169\.254\.169\.254 resolves|ENOTFOUND/.test(joined), joined.slice(0, 500));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.log(`fatal: ${(err as Error).stack}`);
  process.exit(1);
});
