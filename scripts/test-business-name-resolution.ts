/* eslint-disable no-console */
/**
 * scripts/test-business-name-resolution.ts
 *
 * Guards the customer-facing business-name resolver
 * (src/lib/intelligence/resolve-business-name.ts). A wrong name on the
 * cover/PDF/email is a credibility-breaking defect ("this report isn't
 * even about my business"). The resolver picks the most authoritative
 * source available and flags an honest inconsistency when the detected
 * name diverges from the customer's input rather than silently
 * overwriting it.
 *
 * Pins the full priority chain:
 *   schema > article-title > homepage > footer > order > domain
 * and the inconsistency-flagging rule (fires only for a non-order /
 * non-domain source that is *meaningfully* different from the order
 * input — not a mere case/whitespace/substring variation).
 */

import assert from "node:assert/strict";

import {
  resolveBusinessName,
  type BusinessNameResolution,
} from "../src/lib/intelligence/resolve-business-name";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

type NameTriple = { schema: string | null; homepage: string | null; footer: string | null };

function preflight(opts: {
  schemaName?: string | null;
  articleTitle?: string | null;
  homepageName?: string | null;
  footerName?: string | null;
}): unknown {
  const name: NameTriple = {
    schema: opts.schemaName ?? null,
    homepage: opts.homepageName ?? null,
    footer: opts.footerName ?? null,
  };
  return {
    ok: true,
    engineVersion: "v1",
    runDurationMs: 5,
    fetchedUrl: "https://example.com",
    fetchOk: true,
    readability:
      opts.articleTitle !== undefined
        ? {
            textLength: 100,
            parsedByReadability: true,
            fallbackUsed: false,
            articleTitle: opts.articleTitle,
            wordCount: 20,
            preview: "",
          }
        : null,
    schema: null,
    crawlability: null,
    entityConsistency: {
      score: 70,
      extractedEntities: {
        name,
        phone: { schema: null, homepage: null, footer: null },
        address: { schema: null, homepage: null, footer: null },
      },
      inconsistencies: [],
      confidence: 0.8,
    },
  };
}

const ORDER = {
  businessName: "Acme Co",
  email: "owner@acme.com",
  websiteUrl: "https://acmeplumbing.com",
};

function resolve(preflightSignals: unknown): BusinessNameResolution {
  return resolveBusinessName({
    intelligence: { preflightSignals },
    order: ORDER,
  });
}

console.log("[business-name-resolution] running...");

// ── Priority 1: schema wins over everything ─────────────────────────
check("schema name has top priority", () => {
  const r = resolve(
    preflight({
      schemaName: "Acme Plumbing LLC",
      articleTitle: "Article Title Brand",
      homepageName: "Homepage Name",
      footerName: "Footer Name",
    }),
  );
  assert.equal(r.source, "schema");
  assert.equal(r.name, "Acme Plumbing LLC");
});

// ── Priority 2: article-title when no schema ────────────────────────
check("article-title wins when schema absent", () => {
  const r = resolve(
    preflight({
      articleTitle: "Acme Plumbing — Trusted Local Plumbers",
      homepageName: "Homepage Name",
      footerName: "Footer Name",
    }),
  );
  assert.equal(r.source, "article-title");
  // Separator-suffix cleaning keeps the descriptive segment.
  assert.ok(r.name.length > 0, "article-title resolved empty");
});

// ── Priority 3: homepage when no schema/article ─────────────────────
check("homepage wins when schema + article absent", () => {
  const r = resolve(
    preflight({ homepageName: "Acme Plumbing", footerName: "Footer Name" }),
  );
  assert.equal(r.source, "homepage");
  assert.equal(r.name, "Acme Plumbing");
});

// ── Priority 4: footer ──────────────────────────────────────────────
check("footer wins when only footer present", () => {
  const r = resolve(preflight({ footerName: "Acme Plumbing Inc" }));
  assert.equal(r.source, "footer");
  assert.equal(r.name, "Acme Plumbing Inc");
});

// ── Priority 5: order input when no preflight signals ───────────────
check("order businessName used when preflight has no names", () => {
  const r = resolve(preflight({}));
  assert.equal(r.source, "order");
  assert.equal(r.name, "Acme Co");
});

// ── Priority 6: domain fallback when nothing else (incl. no order) ──
check("domain fallback when order + preflight both empty", () => {
  const r = resolveBusinessName({
    intelligence: { preflightSignals: preflight({}) },
    order: { businessName: null, email: null, websiteUrl: "https://acmeplumbing.com" },
  });
  assert.equal(r.source, "domain");
  assert.equal(r.name, "Acmeplumbing");
});

// ── Inconsistency flag: fires on meaningful divergence ──────────────
check("inconsistency flagged when schema name diverges from order", () => {
  const r = resolve(preflight({ schemaName: "Independence Realty Group" }));
  assert.equal(r.source, "schema");
  assert.ok(r.inconsistency, "expected an inconsistency payload");
  assert.equal(r.inconsistency?.primary, "Independence Realty Group");
  assert.deepEqual(r.inconsistency?.alternates, ["Acme Co"]);
});

// ── Inconsistency flag: silent on case/substring variation ──────────
check("no inconsistency on case-only variation", () => {
  const r = resolveBusinessName({
    intelligence: { preflightSignals: preflight({ schemaName: "ACME CO" }) },
    order: ORDER,
  });
  assert.equal(r.inconsistency, null, "should not flag case-only difference");
});

check("no inconsistency when schema is a superset of the order name", () => {
  // "Acme Co" is a substring of "Acme Co Plumbing" → not meaningfully
  // different, so no scary inconsistency pill.
  const r = resolveBusinessName({
    intelligence: { preflightSignals: preflight({ schemaName: "Acme Co Plumbing" }) },
    order: ORDER,
  });
  assert.equal(r.inconsistency, null, "substring should not flag");
});

// ── Inconsistency flag: never fires for order/domain source ─────────
check("no inconsistency when the order name itself is chosen", () => {
  const r = resolve(preflight({}));
  assert.equal(r.source, "order");
  assert.equal(r.inconsistency, null);
});

// ── SEO-junk quality gate (Moore Roofing production defect) ─────────
// The on-site name/title was the SEO string "Commercial Flat Roofing
// Experts Serving Ohio, Michigan, Indiana - Repair". It must NEVER
// become the hero name — the resolver falls through to the clean order
// name, and (with no order name) to the domain.
const MOORE_SEO =
  "Commercial Flat Roofing Experts Serving Ohio, Michigan, Indiana - Repair";

check("SEO-stuffed schema/title name is rejected → order name wins", () => {
  const r = resolveBusinessName({
    intelligence: {
      preflightSignals: preflight({
        schemaName: MOORE_SEO,
        articleTitle: MOORE_SEO,
        homepageName: MOORE_SEO,
      }),
    },
    order: {
      businessName: "Moore Roofing",
      email: "x@moore-roofing.com",
      websiteUrl: "https://www.moore-roofing.com",
    },
  });
  assert.equal(r.name, "Moore Roofing", `got "${r.name}"`);
  assert.equal(r.source, "order");
  assert.equal(r.inconsistency, null, "junk name must not surface as alternate");
});

check("SEO-stuffed name + no order name → domain fallback, not junk", () => {
  const r = resolveBusinessName({
    intelligence: {
      preflightSignals: preflight({ schemaName: MOORE_SEO, articleTitle: MOORE_SEO }),
    },
    order: { businessName: null, email: null, websiteUrl: "https://www.moore-roofing.com" },
  });
  assert.equal(r.source, "domain");
  assert.equal(r.name, "Moore Roofing");
});

check("article title is not salvaged into a trailing junk word", () => {
  // Previously cleanArticleTitle reduced "...- Repair" to "Repair".
  const r = resolveBusinessName({
    intelligence: { preflightSignals: preflight({ articleTitle: MOORE_SEO }) },
    order: { businessName: "Moore Roofing", email: null, websiteUrl: "https://moore-roofing.com" },
  });
  assert.notEqual(r.name, "Repair");
  assert.equal(r.name, "Moore Roofing");
});

check("a legitimate multi-word name still passes the gate", () => {
  const r = resolve(preflight({ schemaName: "Independence Realty Group" }));
  assert.equal(r.source, "schema");
  assert.equal(r.name, "Independence Realty Group");
});

check("a name that merely contains a state word still passes", () => {
  // One state token is fine ("Ohio Valley Roofing"); only TWO+ states
  // (a service-area list) trips the gate.
  const r = resolve(preflight({ schemaName: "Ohio Valley Roofing" }));
  assert.equal(r.source, "schema");
  assert.equal(r.name, "Ohio Valley Roofing");
});

// ── Browser / bot-wall interstitial blacklist (LaBre Law defect) ────
// A Cloudflare-protected site fetches "Just a moment..." as the title.
// That must NEVER be the business name.
for (const junk of [
  "Just a moment...",
  "Loading...",
  "Please wait",
  "Attention Required! | Cloudflare",
  "Access denied",
  "Checking your browser before accessing",
  "Just a moment… | Cloudflare",
]) {
  check(`junk title "${junk.slice(0, 28)}…" is rejected → order name`, () => {
    const r = resolveBusinessName({
      intelligence: {
        preflightSignals: preflight({
          schemaName: junk,
          articleTitle: junk,
          homepageName: junk,
        }),
      },
      order: { businessName: "LaBre Law", email: null, websiteUrl: "https://labrelaw.com" },
    });
    assert.equal(r.name, "LaBre Law", `got "${r.name}"`);
    assert.doesNotMatch(r.name.toLowerCase(), /just a moment|cloudflare|loading|denied/);
  });
}

// ── Generic / descriptive titles (Sherriff Goslin + Cleveland defects)
for (const junk of ["Home", "Homepage", "Welcome", "Index"]) {
  check(`generic page title "${junk}" is rejected → order name`, () => {
    const r = resolveBusinessName({
      intelligence: { preflightSignals: preflight({ schemaName: junk, articleTitle: junk, homepageName: junk }) },
      order: { businessName: "Sherriff Goslin", email: null, websiteUrl: "https://sherriffgoslin.com" },
    });
    assert.equal(r.name, "Sherriff Goslin", `got "${r.name}"`);
  });
}

check("descriptive '<service> in <Place>' title is rejected → order name", () => {
  const r = resolveBusinessName({
    intelligence: {
      preflightSignals: preflight({
        schemaName: "Full Service Dentistry in Northeast Ohio",
        articleTitle: "Full Service Dentistry in Northeast Ohio",
        homepageName: "Full Service Dentistry in Northeast Ohio",
      }),
    },
    order: { businessName: "Cleveland Smile Center", email: null, websiteUrl: "https://clevelandsmilecenter.com" },
  });
  assert.equal(r.name, "Cleveland Smile Center");
});

check("LaBre intercaps casing is preserved (not flattened to 'Labre')", () => {
  const r = resolveBusinessName({
    intelligence: { preflightSignals: preflight({}) },
    order: { businessName: "LaBre Law", email: null, websiteUrl: "https://labrelaw.com" },
  });
  assert.equal(r.name, "LaBre Law");
});

// ── Provider-consensus fallback (junk on-site + no order name) ──────
const LABRE_VALIDATIONS = {
  outputs: [
    { provider: "openai", status: "passed", raw_summary: "LaBre Law Office is a personal injury law firm serving Toledo." },
    { provider: "claude", status: "passed", raw_summary: "LaBre Law Office is a law practice focused on injury cases." },
    { provider: "gemini", status: "passed", raw_summary: "The firm provides legal services in Ohio." },
  ],
};

check("provider consensus resolves the name when on-site + order are junk/absent", () => {
  const r = resolveBusinessName({
    intelligence: {
      preflightSignals: preflight({ schemaName: "Just a moment...", articleTitle: "Just a moment..." }),
      aiValidations: LABRE_VALIDATIONS,
    },
    order: { businessName: null, email: null, websiteUrl: "https://labrelaw.com" },
  });
  assert.equal(r.source, "provider-consensus");
  assert.equal(r.name, "LaBre Law Office");
});

check("single-provider name is NOT enough for consensus (needs >= 2)", () => {
  const r = resolveBusinessName({
    intelligence: {
      preflightSignals: preflight({ schemaName: "Just a moment..." }),
      aiValidations: {
        outputs: [
          { provider: "openai", status: "passed", raw_summary: "LaBre Law Office is a firm." },
          { provider: "claude", status: "passed", raw_summary: "Some other description entirely." },
        ],
      },
    },
    order: { businessName: null, email: null, websiteUrl: "https://labrelaw.com" },
  });
  assert.equal(r.source, "domain", "should fall to domain without 2-provider agreement");
});

if (failed > 0) {
  console.log(
    `[business-name-resolution] FAILED — passed=${passed} failed=${failed}`,
  );
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[business-name-resolution] passed=${passed} failed=0`);
