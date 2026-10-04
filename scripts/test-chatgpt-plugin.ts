/* eslint-disable no-console */
/**
 * scripts/test-chatgpt-plugin.ts
 *
 * DB-free tests for the GeoViz ChatGPT plugin (src/lib/chatgpt-plugin,
 * src/app/mcp). No network: a fake DNS resolver + fake transport sit under
 * the REAL safeFetch, so SSRF rules are exercised exactly as in production.
 *
 * Guards: valid site (same score as the free /check), invalid URLs,
 * private/local targets (incl. DNS → private, redirect → private), timeouts,
 * oversized responses, rate limits, truthful claim boundaries, safe errors,
 * secret-safe logs, and the MCP protocol surface.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { checkBusinessVisibility, DISCLAIMER, LIMITS, TOOL_NAME } from "../src/lib/chatgpt-plugin/check-business-visibility";
import { handleMcpRequest } from "../src/lib/chatgpt-plugin/server";
import { CARD_HTML, CARD_MIME_TYPE, CARD_URI } from "../src/lib/chatgpt-plugin/result-card";
import { runFreeCheck } from "../src/lib/free-check/runFreeCheck";
import type { FetchRawHtmlResult } from "../src/lib/intelligence/preflight/fetchRawHtml";
import type { Resolver, Transport } from "../src/lib/monitoring/website/safe-fetch";
import { GET, POST } from "../src/app/mcp/route";

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

// ── Fixtures ───────────────────────────────────────────────────────────
const PAGE = `<!doctype html><html><head><title>Summit Roofing | Denver Roofers</title>
<link rel="canonical" href="https://summitroofing.example/">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "RoofingContractor",
  name: "Summit Roofing",
  telephone: "+1-303-555-0100",
  url: "https://summitroofing.example/",
  address: { "@type": "PostalAddress", streetAddress: "100 Main St", addressLocality: "Denver", addressRegion: "CO", postalCode: "80202" },
  openingHours: "Mo-Fr 08:00-17:00",
})}</script></head><body>
<main><h1>Summit Roofing — roof repair and replacement in Denver, CO</h1>
${"<p>Summit Roofing has repaired and replaced roofs across Denver, Colorado since 2009. We handle storm damage, shingle replacement, flat roofs, gutters, and insurance claims for homeowners and small businesses. Call +1-303-555-0100 for a free inspection.</p>".repeat(6)}
<h2>Frequently asked questions</h2><h3>How long does a roof replacement take?</h3><p>Most homes take one to two days.</p></main>
<footer>Summit Roofing · 100 Main St, Denver, CO 80202 · +1-303-555-0100</footer></body></html>`;

type Route = { status: number; body?: string; contentType?: string; location?: string; truncated?: boolean } | "timeout" | "hang";

function fakeNet(dns: Record<string, string>, routes: Record<string, Route>) {
  const calls: string[] = [];
  const resolver: Resolver = async (host) => {
    const ip = dns[host];
    if (!ip) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return [{ address: ip, family: ip.includes(":") ? 6 : 4 }];
  };
  const transport: Transport = async (url) => {
    calls.push(url.toString());
    const r = routes[url.toString()] ?? { status: 404, body: "" };
    if (r === "timeout") throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    if (r === "hang") return new Promise(() => {});
    const headers: Record<string, string | undefined> = { "content-type": r.contentType ?? "text/html; charset=utf-8", location: r.location };
    return { status: r.status, headers, body: Buffer.from(r.body ?? ""), truncated: Boolean(r.truncated) };
  };
  return { resolver, transport, calls };
}

const PUBLIC_IP = "93.184.216.34";
function siteNet(domain: string, extra: Record<string, Route> = {}) {
  return fakeNet(
    { [domain]: PUBLIC_IP, [`www.${domain}`]: PUBLIC_IP },
    {
      [`https://${domain}/`]: { status: 200, body: PAGE.replaceAll("summitroofing.example", domain) },
      [`https://${domain}/robots.txt`]: { status: 200, body: "User-agent: *\nAllow: /\n", contentType: "text/plain" },
      [`https://${domain}/sitemap.xml`]: { status: 200, body: '<?xml version="1.0"?><urlset></urlset>', contentType: "application/xml" },
      ...extra,
    },
  );
}

let keyN = 0;
const freshKey = () => `testclient${(keyN += 1)}`;
const FIXED_NOW = () => new Date("2026-10-03T12:00:00Z");

// Capture logs for the secret-safety check.
const logs: string[] = [];
for (const m of ["info", "warn", "error", "log"] as const) {
  const orig = console[m].bind(console);
  console[m] = (...a: unknown[]) => {
    const s = a.map(String).join(" ");
    if (!s.startsWith("  ✓") && !s.startsWith("  ✗")) logs.push(s);
    if (m === "log") orig(...a);
  };
}

async function main() {
  console.log("\nGeoViz ChatGPT plugin — check_business_visibility\n");

  // ── Valid site ──
  await check("valid site returns the full, labeled output shape", async () => {
    const net = siteNet("summitroofing.example");
    const r = await checkBusinessVisibility(
      { websiteUrl: "summitroofing.example", businessName: "Summit Roofing", city: "Denver", state: "CO" },
      { clientKey: freshKey(), ...net, now: FIXED_NOW, siteUrl: "https://www.geoviz.ai" },
    );
    assert.ok(r.ok, r.ok ? "" : r.message);
    const o = r.output;
    assert.equal(o.checkType, "website_ai_readiness");
    assert.equal(o.scoreLabel, "Website AI-readiness (free check)");
    assert.deepEqual(o.business, { name: "Summit Roofing", nameProvided: true, city: "Denver", state: "CO" });
    assert.equal(o.websiteChecked, "https://summitroofing.example/");
    assert.ok(o.score >= 0 && o.score <= 100);
    assert.equal(o.findings.length, 6);
    assert.ok(o.priorityImprovements.length <= 3);
    assert.ok(o.evidence.some((e) => e.includes("RoofingContractor")), o.evidence.join(" | "));
    assert.ok(o.evidence.includes("robots.txt found and it does not block all crawlers."));
    assert.ok(o.evidence.includes("sitemap.xml found."));
    assert.equal(o.checkedAt, "2026-10-03T12:00:00.000Z");
    assert.equal(o.links.freeCheck, "https://www.geoviz.ai/check");
    assert.equal(o.links.fullAudit, "https://www.geoviz.ai/order?websiteUrl=https%3A%2F%2Fsummitroofing.example%2F");
    assert.deepEqual(o.aiSystemsQueried, []);
    assert.equal(o.disclaimer, DISCLAIMER);
  });

  await check("score and findings are identical to the free /check analysis (no second scoring system)", async () => {
    const net = siteNet("parity.example");
    const r = await checkBusinessVisibility(
      { websiteUrl: "https://parity.example", businessName: "Summit Roofing", city: "Denver", state: "CO" },
      { clientKey: freshKey(), ...net },
    );
    assert.ok(r.ok);
    // Same page through the default /check code path (fetcher seam fed the same bytes).
    const routes: Record<string, string> = {
      "https://parity.example/": PAGE.replaceAll("summitroofing.example", "parity.example"),
      "https://parity.example/robots.txt": "User-agent: *\nAllow: /\n",
      "https://parity.example/sitemap.xml": '<?xml version="1.0"?><urlset></urlset>',
    };
    const plain = async (url: string): Promise<FetchRawHtmlResult> =>
      routes[url] !== undefined ? { ok: true, html: routes[url]!, finalUrl: url, status: 200, contentType: "text/html" } : { ok: true, html: "", finalUrl: url, status: 404, contentType: null };
    const base = await runFreeCheck(
      { websiteUrl: "https://parity.example/", businessName: "Summit Roofing", city: "Denver", state: "CO", category: "" },
      { fetcher: plain },
    );
    assert.ok(base.ok);
    assert.equal(r.output.score, base.overallScore);
    assert.deepEqual(r.output.findings, base.checks.map((c) => ({ id: c.id, label: c.label, status: c.status, explanation: c.explanation })));
    assert.deepEqual(r.output.priorityImprovements, base.fixes);
  });

  await check("missing business name falls back to the domain and says so", async () => {
    const r = await checkBusinessVisibility({ websiteUrl: "https://noname.example" }, { clientKey: freshKey(), ...siteNet("noname.example") });
    assert.ok(r.ok);
    assert.equal(r.output.business.nameProvided, false);
    assert.equal(r.output.business.name, "Noname");
    assert.ok(r.output.evidence.some((e) => e.startsWith("No business name was provided")));
  });

  await check("robots.txt / sitemap.xml 404 are reported as absent, not as failures", async () => {
    const net = siteNet("bare.example", { "https://bare.example/robots.txt": { status: 404 }, "https://bare.example/sitemap.xml": { status: 404 } });
    const r = await checkBusinessVisibility({ websiteUrl: "bare.example", businessName: "Bare Co" }, { clientKey: freshKey(), ...net });
    assert.ok(r.ok);
    assert.ok(r.output.evidence.includes("No robots.txt found."));
    assert.ok(r.output.evidence.includes("No valid sitemap.xml found."));
  });

  await check("online business end to end: businessType online, location not applicable, reason in evidence", async () => {
    const saas = `<!doctype html><html><head><title>Ledgerly — invoicing software</title>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Ledgerly", url: "https://ledgerly.example/", applicationCategory: "BusinessApplication" })}</script></head>
<body><main><h1>Ledgerly invoicing software</h1>${"<p>Ledgerly is invoicing software for freelancers. Send invoices, track payments, and reconcile expenses in one place.</p>".repeat(8)}
<p>Start your free trial. See pricing. Log in.</p></main></body></html>`;
    const net = siteNet("ledgerly.example", { "https://ledgerly.example/": { status: 200, body: saas } });
    const r = await checkBusinessVisibility({ websiteUrl: "ledgerly.example", businessName: "Ledgerly" }, { clientKey: freshKey(), ...net });
    assert.ok(r.ok, r.ok ? "" : r.message);
    assert.equal(r.output.businessType, "online");
    const loc = r.output.findings.find((f) => f.id === "location_clarity")!;
    assert.equal(loc.status, "not_applicable");
    assert.ok(!r.output.priorityImprovements.includes("Strengthen your location signals."));
    assert.match(r.output.evidence[0]!, /^Scored as an online business, so storefront location and opening hours aren't scored\. Reason: SoftwareApplication structured data/);
    assert.match(r.text, /Location clarity: not applicable/);
    // v1.2: structured data judged on Organization / WebSite / product schema, not LocalBusiness.
    const sd = r.output.findings.find((f) => f.id === "structured_data")!;
    assert.equal(sd.label, "Structured data / Organization & product schema");
    assert.ok(r.output.evidence.some((e) => e.startsWith("Online business schema present:") && e.includes("Product / SoftwareApplication name")), r.output.evidence.join(" | "));
    assert.ok(r.output.evidence.some((e) => e.startsWith("Online business schema missing:") && e.includes("WebSite")));
    assert.ok(!r.output.evidence.some((e) => /Business fields (present|missing)/.test(e)), "no LocalBusiness field lines");
    assert.ok(!/LocalBusiness|opening hours|street address/i.test(JSON.stringify(r.output.findings) + r.output.priorityImprovements.join(" ")));
  });

  await check("local business reports businessType local", async () => {
    const r = await checkBusinessVisibility({ websiteUrl: "localbiz.example", businessName: "Summit Roofing", city: "Denver", state: "CO" }, { clientKey: freshKey(), ...siteNet("localbiz.example") });
    assert.ok(r.ok);
    assert.equal(r.output.businessType, "local");
    assert.match(r.output.evidence[0]!, /^Scored as a local business/);
    assert.equal(r.output.findings.find((f) => f.id === "structured_data")!.label, "Structured data / LocalBusiness schema");
    assert.ok(r.output.evidence.some((e) => e.startsWith("Business fields present in structured data:")));
  });

  // ── Invalid URLs ──
  for (const bad of ["ftp://example.com/", "not a url", "https://user:pass@example.com/", "https://example.com:8080/", "javascript:alert(1)", "x", "https://intranet/"]) {
    await check(`invalid URL rejected without any request: ${JSON.stringify(bad)}`, async () => {
      const net = fakeNet({}, {});
      const r = await checkBusinessVisibility({ websiteUrl: bad }, { clientKey: freshKey(), ...net });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.kind === "invalid_input" || r.kind === "blocked_target", r.kind);
      assert.equal(net.calls.length, 0);
    });
  }

  // ── Private / local targets ──
  for (const target of ["http://127.0.0.1/", "http://10.0.0.8/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://192.168.1.1/", "http://localhost/", "http://printer.local/", "http://[::ffff:127.0.0.1]/"]) {
    await check(`private/local target blocked: ${target}`, async () => {
      const net = fakeNet({}, {});
      const r = await checkBusinessVisibility({ websiteUrl: target }, { clientKey: freshKey(), ...net });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.kind === "blocked_target" || r.kind === "invalid_input", r.kind);
      assert.equal(net.calls.length, 0);
    });
  }

  await check("public hostname that resolves to a private IP is blocked before any request", async () => {
    const net = fakeNet({ "sneaky.example": "10.1.2.3" }, {});
    const r = await checkBusinessVisibility({ websiteUrl: "https://sneaky.example" }, { clientKey: freshKey(), ...net });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "blocked_target");
    assert.equal(net.calls.length, 0);
  });

  await check("same-site redirect to a host that resolves privately is blocked", async () => {
    const net = fakeNet(
      { "rebind.example": PUBLIC_IP, "www.rebind.example": "169.254.169.254" },
      { "https://rebind.example/": { status: 301, location: "https://www.rebind.example/" } },
    );
    const r = await checkBusinessVisibility({ websiteUrl: "https://rebind.example" }, { clientKey: freshKey(), ...net });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "blocked_target");
    assert.deepEqual(net.calls, ["https://rebind.example/"]);
  });

  await check("redirect to another site (e.g. an internal IP) is not followed", async () => {
    const net = fakeNet({ "hop.example": PUBLIC_IP }, { "https://hop.example/": { status: 302, location: "http://127.0.0.1:2375/" } });
    const r = await checkBusinessVisibility({ websiteUrl: "https://hop.example" }, { clientKey: freshKey(), ...net });
    assert.equal(r.ok, false);
    assert.deepEqual(net.calls, ["https://hop.example/"]);
  });

  // ── Timeouts / size ──
  await check("transport timeout returns a safe timeout message", async () => {
    const net = fakeNet({ "slow.example": PUBLIC_IP }, { "https://slow.example/": "timeout" });
    const r = await checkBusinessVisibility({ websiteUrl: "slow.example" }, { clientKey: freshKey(), ...net });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.kind, "timeout");
      assert.match(r.message, /took too long/);
    }
  });

  await check("overall deadline bounds a hanging site", async () => {
    const net = fakeNet({ "hang.example": PUBLIC_IP }, { "https://hang.example/": "hang" });
    const t0 = Date.now();
    const r = await checkBusinessVisibility({ websiteUrl: "hang.example" }, { clientKey: freshKey(), ...net, deadlineMs: 150 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "timeout");
    assert.ok(Date.now() - t0 < 2_000);
  });

  await check("oversized homepage is refused (too_large)", async () => {
    const net = fakeNet({ "huge.example": PUBLIC_IP }, { "https://huge.example/": { status: 200, body: "x".repeat(1024), truncated: true } });
    const r = await checkBusinessVisibility({ websiteUrl: "huge.example" }, { clientKey: freshKey(), ...net });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.kind, "too_large");
      assert.match(r.message, /1\.5 MB/);
    }
  });

  await check("non-HTML homepage is refused", async () => {
    const net = fakeNet({ "pdf.example": PUBLIC_IP }, { "https://pdf.example/": { status: 200, body: "%PDF", contentType: "application/pdf" } });
    const r = await checkBusinessVisibility({ websiteUrl: "pdf.example" }, { clientKey: freshKey(), ...net });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "not_html");
  });

  // ── Rate limits ──
  await check(`per-domain limit (${LIMITS.perDomain}/10 min) returns a retry message`, async () => {
    const results = [];
    for (let i = 0; i < LIMITS.perDomain + 1; i += 1) {
      results.push(await checkBusinessVisibility({ websiteUrl: "popular.example", businessName: "Pop" }, { clientKey: freshKey(), ...siteNet("popular.example") }));
    }
    assert.ok(results.slice(0, LIMITS.perDomain).every((r) => r.ok));
    const last = results[LIMITS.perDomain]!;
    assert.equal(last.ok, false);
    if (!last.ok) {
      assert.equal(last.kind, "rate_limited");
      assert.match(last.message, /try again in about \d+ minutes?/);
    }
  });

  await check(`per-client limit (${LIMITS.perClient}/10 min) applies across domains`, async () => {
    const key = freshKey();
    let last;
    for (let i = 0; i <= LIMITS.perClient; i += 1) {
      const d = `client${i}.example`;
      last = await checkBusinessVisibility({ websiteUrl: d, businessName: "Client Co" }, { clientKey: key, ...siteNet(d) });
    }
    assert.ok(last && !last.ok && last.kind === "rate_limited");
  });

  // ── Claim boundaries ──
  await check("output never claims an AI system recommended or mentioned the business", async () => {
    const r = await checkBusinessVisibility({ websiteUrl: "claims.example", businessName: "Summit Roofing" }, { clientKey: freshKey(), ...siteNet("claims.example") });
    assert.ok(r.ok);
    const all = `${JSON.stringify(r.output)}\n${r.text}`;
    for (const banned of [/recommend(s|ed)? (your|this|the) business/i, /\b(chatgpt|claude|gemini|perplexity) (says|said|recommends|recommended|mentions|mentioned)\b/i, /guarantee/i, /\brank(s|ed|ing)? (higher|#?\d)/i]) {
      assert.ok(!banned.test(all.replace(DISCLAIMER, "")), `matched ${banned}`);
    }
    assert.deepEqual(r.output.aiSystemsQueried, []);
    assert.ok(r.text.includes(DISCLAIMER), "text summary carries the disclaimer");
    assert.ok(DISCLAIMER.includes("did not ask ChatGPT, Claude, Gemini, or Perplexity"));
  });

  await check("plugin code imports no AI provider or database modules", () => {
    const dir = path.join(__dirname, "../src/lib/chatgpt-plugin");
    const files = [...readdirSync(dir).map((f) => path.join(dir, f)), path.join(__dirname, "../src/app/mcp/route.ts")];
    for (const f of files) {
      const imports = readFileSync(f, "utf8").match(/^import .* from ".*";$/gm) ?? [];
      for (const line of imports) {
        assert.ok(!/openai|anthropic|gemini|google|perplexity|prisma|stripe|resend|monitoring\/(auth|tracking|webhook)/i.test(line.replace("@/lib/monitoring/website/safe-fetch", "")), `${path.basename(f)}: ${line}`);
      }
    }
  });

  // ── Safe errors / logs ──
  await check("failure messages contain no internals (IPs, stack traces, hostnames resolved)", async () => {
    const net = fakeNet({ "leak.example": "10.9.8.7" }, {});
    const r = await checkBusinessVisibility({ websiteUrl: "leak.example" }, { clientKey: freshKey(), ...net });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(!/10\.9\.8\.7|Error|\bat \S+:\d+|resolves?\b|ENOTFOUND|leak\.example/i.test(r.message), r.message);
  });

  // ── MCP protocol ──
  const rpc = (method: string, params: unknown = {}, id = 1) =>
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": "203.0.113.77", "x-vercel-protection-bypass": "SECRET-BYPASS-TOKEN" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

  await check("initialize returns server info and instructions with the claim boundary", async () => {
    const res = await POST(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result.serverInfo.name, "geoviz");
    assert.match(body.result.instructions, /never present it as evidence that any AI system recommends/);
  });

  await check("tools/list exposes one read-only tool with schema, annotations, and card link", async () => {
    const res = await POST(rpc("tools/list"));
    const body = await res.json();
    assert.equal(body.result.tools.length, 1);
    const t = body.result.tools[0];
    assert.equal(t.name, TOOL_NAME);
    assert.deepEqual(t.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    assert.deepEqual(t.inputSchema.required, ["websiteUrl"]);
    assert.ok(t.outputSchema.properties.disclaimer);
    assert.equal(t._meta.ui.resourceUri, CARD_URI);
    assert.equal(t._meta["openai/outputTemplate"], CARD_URI);
  });

  await check("resources/read returns the MCP Apps card with an empty CSP allowlist", async () => {
    const res = await POST(rpc("resources/read", { uri: CARD_URI }));
    const body = await res.json();
    const c = body.result.contents[0];
    assert.equal(c.mimeType, CARD_MIME_TYPE);
    assert.deepEqual(c._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    assert.ok(!/<script[^>]+src=|<link[^>]+href=|innerHTML/i.test(CARD_HTML), "card loads nothing external and never uses innerHTML");
  });

  await check("tools/call through MCP returns structuredContent + text (fake network)", async () => {
    const net = siteNet("mcpcall.example");
    const res = await handleMcpRequest(rpc("tools/call", { name: TOOL_NAME, arguments: { websiteUrl: "mcpcall.example", businessName: "Summit Roofing" } }), freshKey(), { resolver: net.resolver, transport: net.transport });
    const body = await res.json();
    assert.equal(body.result.isError, undefined);
    assert.equal(body.result.structuredContent.checkType, "website_ai_readiness");
    assert.match(body.result.content[0].text, /did not ask ChatGPT/);
  });

  await check("tools/call with a private target returns isError with a safe message", async () => {
    const res = await handleMcpRequest(rpc("tools/call", { name: TOOL_NAME, arguments: { websiteUrl: "http://169.254.169.254/" } }), freshKey(), fakeNet({}, {}));
    const body = await res.json();
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /isn't a public business website/);
  });

  await check("GET returns 405; oversized request body returns 413", async () => {
    assert.equal((await GET()).status, 405);
    const big = new Request("https://preview.example/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(70_000) } }) });
    assert.equal((await POST(big)).status, 413);
  });

  await check("logs contain no raw client IP, bypass token, or page content", () => {
    const joined = logs.join("\n");
    assert.ok(joined.includes("[chatgpt-plugin]"), "plugin log lines were emitted");
    assert.ok(!joined.includes("203.0.113.77"), "raw IP leaked");
    assert.ok(!joined.includes("SECRET-BYPASS-TOKEN"), "bypass token leaked");
    assert.ok(!joined.includes("Summit Roofing has repaired"), "page content leaked");
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
