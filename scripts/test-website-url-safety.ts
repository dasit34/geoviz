/* eslint-disable no-console */
/**
 * scripts/test-website-url-safety.ts — SSRF protection for the website
 * scanner: blocked address ranges, URL shape, DNS answers, redirects, and
 * connect-time (anti-rebinding) validation on the real transport.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { harness } from "./lib/monitoring-fakes";
import {
  checkUrlShape,
  isBlockedAddress,
  nodeTransport,
  safeFetch,
  SCANNER_USER_AGENT,
  type Resolver,
  type Transport,
} from "../src/lib/monitoring/website/safe-fetch";

const h = harness("website-url-safety");
const publicDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const ok = (body = "<html><title>x</title></html>", headers: Record<string, string> = { "content-type": "text/html" }) => ({ status: 200, headers, body: Buffer.from(body), truncated: false });

(async () => {
  console.log("[website-url-safety] running...");

  await h.check("private, loopback, link-local, CGNAT, multicast, reserved IPv4 are blocked", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "240.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1"]) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.128.0.1"]) assert.equal(isBlockedAddress(ip), false, ip);
  });

  await h.check("IPv6 loopback, ULA, link-local, multicast, IPv4-mapped and NAT64 private are blocked", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::a00:1", "2001:db8::1"]) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
    assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
    assert.equal(isBlockedAddress("::ffff:8.8.8.8"), false);
  });

  await h.check("URL shape: protocol, credentials, ports, IP literals, internal hostnames", () => {
    for (const bad of ["ftp://example.com/", "file:///etc/passwd", "https://user:pw@example.com/", "https://example.com:8080/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://localhost/", "http://intranet/", "http://printer.local/", "http://db.internal/", "javascript:alert(1)"]) {
      assert.equal(checkUrlShape(bad).ok, false, bad);
    }
    for (const good of ["https://example.com/", "http://www.example.com:80/x", "https://example.com:443/"]) assert.equal(checkUrlShape(good).ok, true, good);
  });

  await h.check("a hostname that resolves to a private address is refused before any request", async () => {
    let calls = 0;
    const transport: Transport = async () => (calls++, ok());
    const r = await safeFetch("https://evil.example.com/", { site: "evil.example.com", accept: "html", resolver: async () => [{ address: "10.0.0.5", family: 4 }], transport });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.fetchStatus, "blocked_unsafe");
    assert.equal(calls, 0);
  });

  await h.check("any private answer among several DNS answers is refused", async () => {
    const r = await safeFetch("https://mixed.example.com/", {
      site: "mixed.example.com",
      accept: "html",
      resolver: async () => [{ address: "93.184.216.34", family: 4 }, { address: "::ffff:192.168.0.1", family: 6 }],
      transport: async () => ok(),
    });
    assert.equal(!r.ok && r.fetchStatus, "blocked_unsafe");
  });

  await h.check("redirects: same-site followed; to a private IP or another site refused", async () => {
    const hops: string[] = [];
    const transport: Transport = async (url) => {
      hops.push(url.toString());
      if (url.pathname === "/a") return { status: 301, headers: { location: "https://www.site.example/b" }, body: Buffer.alloc(0), truncated: false };
      if (url.pathname === "/b") return ok();
      if (url.pathname === "/to-private") return { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" }, body: Buffer.alloc(0), truncated: false };
      if (url.pathname === "/to-other") return { status: 302, headers: { location: "https://other.example/" }, body: Buffer.alloc(0), truncated: false };
      return { status: 404, headers: {}, body: Buffer.alloc(0), truncated: false };
    };
    const a = await safeFetch("https://site.example/a", { site: "site.example", accept: "html", resolver: publicDns, transport });
    assert.equal(a.ok, true);
    assert.equal(a.ok && a.finalUrl, "https://www.site.example/b");
    const p = await safeFetch("https://site.example/to-private", { site: "site.example", accept: "html", resolver: publicDns, transport });
    assert.equal(!p.ok && p.fetchStatus, "blocked_unsafe");
    const o = await safeFetch("https://site.example/to-other", { site: "site.example", accept: "html", resolver: publicDns, transport });
    assert.equal(!o.ok && o.fetchStatus, "redirect_offsite");
    assert.ok(!hops.some((x) => x.includes("169.254") || x.includes("other.example")), "never requested the refused targets");
  });

  await h.check("redirect loop is capped at 3 hops", async () => {
    let n = 0;
    const r = await safeFetch("https://loop.example/0", {
      site: "loop.example",
      accept: "html",
      resolver: publicDns,
      transport: async () => ({ status: 302, headers: { location: `/${++n}` }, body: Buffer.alloc(0), truncated: false }),
    });
    assert.equal(r.ok, false);
    assert.ok(n <= 4);
  });

  await h.check("401/403 → access_denied (no bypass), 404/410 → not_found, 5xx → http_error, non-HTML, too large", async () => {
    const make = (status: number, extra: Partial<ReturnType<typeof ok>> = {}): Transport => async () => ({ ...ok(), status, ...extra });
    const run = (t: Transport) => safeFetch("https://s.example/", { site: "s.example", accept: "html", resolver: publicDns, transport: t });
    const seenUA: string[] = [];
    const r403 = await safeFetch("https://s.example/", { site: "s.example", accept: "html", resolver: publicDns, transport: async (_u, o) => (seenUA.push(o.headers["User-Agent"]!), { ...ok(), status: 403 }) });
    assert.equal(!r403.ok && r403.fetchStatus, "access_denied");
    assert.deepEqual(seenUA, [SCANNER_USER_AGENT], "one request, our own User-Agent, no retry with another");
    assert.equal(!(await run(make(401))).ok && "x", "x");
    const r404 = await run(make(404));
    assert.equal(!r404.ok && r404.fetchStatus, "not_found");
    const r410 = await run(make(410));
    assert.equal(!r410.ok && r410.fetchStatus, "not_found");
    const r503 = await run(make(503));
    assert.equal(!r503.ok && r503.fetchStatus, "http_error");
    const pdf = await run(make(200, { headers: { "content-type": "application/pdf" } }));
    assert.equal(!pdf.ok && pdf.fetchStatus, "not_html");
    const big = await run(make(200, { truncated: true }));
    assert.equal(!big.ok && big.fetchStatus, "too_large");
  });

  await h.check("real transport re-validates at connect time (DNS rebinding) — local server never receives the request", async () => {
    let hits = 0;
    const server = http.createServer((_req, res) => (hits++, res.end("secret")));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    try {
      // First lookup (pre-check) says public; the socket-level lookup says loopback.
      let call = 0;
      const rebinding: Resolver = async () => (call++ === 0 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]);
      await assert.rejects(
        nodeTransport(new URL(`http://rebind.example:${port}/`), { timeoutMs: 2000, maxBytes: 1000, headers: {}, resolver: async () => [{ address: "127.0.0.1", family: 4 }] }),
        /non-public/,
      );
      const r = await safeFetch(`http://rebind.example/`, { site: "rebind.example", accept: "html", resolver: rebinding });
      assert.equal(r.ok, false);
      assert.equal(hits, 0, "loopback server was never reached");
    } finally {
      server.close();
    }
  });

  h.done();
})();
