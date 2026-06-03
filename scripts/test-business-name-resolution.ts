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

if (failed > 0) {
  console.log(
    `[business-name-resolution] FAILED — passed=${passed} failed=${failed}`,
  );
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[business-name-resolution] passed=${passed} failed=0`);
