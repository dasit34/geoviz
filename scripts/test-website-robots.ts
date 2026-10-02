/* eslint-disable no-console */
/** scripts/test-website-robots.ts — RFC 9309 robots.txt handling. */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { crawlDelayMs, isAllowed, parseRobots, robotsPolicyFrom } from "../src/lib/monitoring/website/robots";

const h = harness("website-robots");

(async () => {
  console.log("[website-robots] running...");

  await h.check("our specific group wins over *", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: GeoVizSiteScanner\nDisallow: /private\n");
    assert.equal(isAllowed(r, "https://x.com/services"), true);
    assert.equal(isAllowed(r, "https://x.com/private/a"), false);
  });

  await h.check("* group applies when no specific group; empty Disallow allows all", () => {
    assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow: /admin\n"), "https://x.com/admin/x"), false);
    assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow:\n"), "https://x.com/anything"), true);
    assert.equal(isAllowed(parseRobots("User-agent: Googlebot\nDisallow: /\n"), "https://x.com/"), true);
  });

  await h.check("longest match wins; ties go to Allow", () => {
    const r = parseRobots("User-agent: *\nDisallow: /services\nAllow: /services/furnace\n");
    assert.equal(isAllowed(r, "https://x.com/services/ac"), false);
    assert.equal(isAllowed(r, "https://x.com/services/furnace-repair"), true);
    const tie = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a\n");
    assert.equal(isAllowed(tie, "https://x.com/a"), true);
  });

  await h.check("* and $ wildcards", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?session=\n");
    assert.equal(isAllowed(r, "https://x.com/files/a.pdf"), false);
    assert.equal(isAllowed(r, "https://x.com/files/a.pdf.html"), true);
    assert.equal(isAllowed(r, "https://x.com/page?session=1"), false);
  });

  await h.check("grouped user-agents, comments, and Sitemap lines", () => {
    const r = parseRobots("# hi\nUser-agent: foo\nUser-agent: *\nDisallow: /x # no\nSitemap: https://x.com/sitemap_index.xml\n");
    assert.equal(isAllowed(r, "https://x.com/x"), false);
    assert.deepEqual(r.sitemaps, ["https://x.com/sitemap_index.xml"]);
  });

  await h.check("robots.txt 4xx → allow all; 5xx / network / timeout → stop the scan", () => {
    assert.equal(robotsPolicyFrom({ ok: false, fetchStatus: "not_found", httpStatus: 404 }).kind, "allow_all");
    assert.equal(robotsPolicyFrom({ ok: false, fetchStatus: "access_denied", httpStatus: 403 }).kind, "allow_all");
    assert.equal(robotsPolicyFrom({ ok: false, fetchStatus: "http_error", httpStatus: 503 }).kind, "disallow_all");
    assert.equal(robotsPolicyFrom({ ok: false, fetchStatus: "timeout", httpStatus: null }).kind, "disallow_all");
    assert.equal(robotsPolicyFrom({ ok: false, fetchStatus: "network_error", httpStatus: null }).kind, "disallow_all");
  });

  await h.check("Crawl-delay honored, minimum 500 ms, capped at 5 s", () => {
    assert.equal(crawlDelayMs(robotsPolicyFrom({ ok: true, body: "User-agent: *\nCrawl-delay: 2\n" })), 2000);
    assert.equal(crawlDelayMs(robotsPolicyFrom({ ok: true, body: "User-agent: *\nCrawl-delay: 60\n" })), 5000);
    assert.equal(crawlDelayMs(robotsPolicyFrom({ ok: true, body: "User-agent: *\nDisallow:\n" })), 500);
  });

  h.done();
})();
