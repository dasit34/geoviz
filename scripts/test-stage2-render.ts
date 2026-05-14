/* eslint-disable no-console */
/**
 * scripts/test-stage2-render.ts
 *
 * V2 Stage 2 smoke test — exercises the render intelligence layer in
 * isolation, using mock providers so no real network / browser is
 * required.
 *
 *   npm run test:stage2-render
 *
 * Asserts (one numbered block per goal):
 *
 *   1. Eligibility module decides correctly on each signal.
 *   2. Render is skipped when GEO_RENDER_ENABLED is false.
 *   3. Render is skipped when no eligibility signal trips.
 *   4. Render runs when env enabled AND eligibility passes.
 *   5. Provider failure is captured in renderFailureReason; audit
 *      flow does NOT throw.
 *   6. Raw fetch failure leaves render comparison fields null but
 *      render itself still attempts.
 *   7. Successful render emits the full delta payload.
 *   8. parseRawSnapshot correctly extracts schema types from JSON-LD.
 *   9. Operator force bypasses signal-based eligibility.
 *   10. Render-disabled + operator force still runs (force overrides
 *       env disable).
 */

import assert from "node:assert/strict";
import {
  EMPTY_RENDER_RESULT,
  type RawFetcher,
  type RawPageSnapshot,
  type RenderInput,
  type RenderOutput,
  type RenderProvider,
} from "../src/lib/intelligence/render/renderProvider";
import {
  shouldRender,
} from "../src/lib/intelligence/render/renderEligibility";
import {
  parseRawSnapshot,
  runRenderIntelligence,
} from "../src/lib/intelligence/render/renderIntelligence";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed += 1;
        console.log(`  ✓ ${name}`);
      },
      (err: unknown) => {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${name}\n      ${message}`);
      },
    );
}

// ─── Test doubles ──────────────────────────────────────────────────

const MOCK_ENGINE = "mock-engine/1.0";

function mockProvider(opts: {
  output?: Partial<RenderOutput>;
  throwError?: string;
}): RenderProvider {
  return {
    engineVersion: MOCK_ENGINE,
    async render(_input: RenderInput): Promise<RenderOutput> {
      if (opts.throwError) throw new Error(opts.throwError);
      return {
        htmlLength: opts.output?.htmlLength ?? 24_000,
        textLength: opts.output?.textLength ?? 3_200,
        schemaTypes: opts.output?.schemaTypes ?? ["LocalBusiness", "Organization"],
        hydrationDetected: opts.output?.hydrationDetected ?? true,
        renderDurationMs: opts.output?.renderDurationMs ?? 1_540,
      };
    },
  };
}

function mockFetcher(snap: RawPageSnapshot | "throw"): RawFetcher {
  return {
    async fetch(_url: string, _timeoutMs: number): Promise<RawPageSnapshot> {
      if (snap === "throw") throw new Error("raw_fetch_failed");
      return snap;
    },
  };
}

const SAMPLE_SHELL_SNAPSHOT: RawPageSnapshot = {
  textLength: 200,
  schemaTypes: [],
  looksLikeShell: true,
};

const SAMPLE_RICH_SNAPSHOT: RawPageSnapshot = {
  textLength: 4_200,
  schemaTypes: ["LocalBusiness", "Organization"],
  looksLikeShell: false,
};

// ─── 1. Eligibility unit tests ─────────────────────────────────────

async function eligibilityTests() {
  console.log("\n[1] Eligibility module");
  await test("declines when no signals match", () => {
    const d = shouldRender({
      frameworkDetected: "vanilla",
      contentDensity: 800,
      rawSnapshot: SAMPLE_RICH_SNAPSHOT,
    });
    assert.equal(d.eligible, false);
    assert.equal(d.reason, "no_signal");
  });
  await test("trips on SPA framework", () => {
    const d = shouldRender({
      frameworkDetected: "nextjs",
      contentDensity: 500,
      rawSnapshot: SAMPLE_RICH_SNAPSHOT,
    });
    assert.equal(d.eligible, true);
    assert.ok(d.signals.some((s) => s.startsWith("framework:")));
  });
  await test("trips on thin content density", () => {
    const d = shouldRender({
      frameworkDetected: "vanilla",
      contentDensity: 80,
      rawSnapshot: SAMPLE_RICH_SNAPSHOT,
    });
    assert.equal(d.eligible, true);
    assert.ok(d.signals.some((s) => s.startsWith("content_density_low")));
  });
  await test("trips on low raw text length", () => {
    const d = shouldRender({
      frameworkDetected: null,
      contentDensity: 1000,
      rawSnapshot: { textLength: 300, schemaTypes: ["LocalBusiness"], looksLikeShell: false },
    });
    assert.equal(d.eligible, true);
    assert.ok(d.signals.some((s) => s.startsWith("raw_text_low")));
  });
  await test("trips on missing schema", () => {
    const d = shouldRender({
      frameworkDetected: null,
      contentDensity: 1000,
      rawSnapshot: { textLength: 2000, schemaTypes: [], looksLikeShell: false },
    });
    assert.equal(d.eligible, true);
    assert.ok(d.signals.includes("schema_missing"));
  });
  await test("trips on shell heuristic", () => {
    const d = shouldRender({
      frameworkDetected: null,
      contentDensity: 1000,
      rawSnapshot: SAMPLE_SHELL_SNAPSHOT,
    });
    assert.equal(d.eligible, true);
    assert.ok(d.signals.includes("looks_like_shell"));
  });
  await test("operator force bypasses signal check", () => {
    const d = shouldRender({
      frameworkDetected: "vanilla",
      contentDensity: 5000,
      rawSnapshot: SAMPLE_RICH_SNAPSHOT,
      operatorForce: true,
    });
    assert.equal(d.eligible, true);
    assert.equal(d.reason, "operator_force");
  });
}

// ─── 2-3. Skip paths ───────────────────────────────────────────────

async function skipPathTests() {
  console.log("\n[2-3] Skip paths — env disabled / no eligibility");
  await test("env disabled returns empty result (no I/O)", async () => {
    const r = await runRenderIntelligence({
      url: "https://example.com",
      frameworkDetected: "nextjs",
      contentDensity: 50,
      provider: mockProvider({ throwError: "should_not_be_called" }),
      rawFetcher: mockFetcher("throw"),
      envOverrides: { enabled: false },
    });
    assert.deepEqual(r, { ...EMPTY_RENDER_RESULT });
  });
  await test("eligible=false returns empty result + preserves raw fields", async () => {
    const r = await runRenderIntelligence({
      url: "https://example.com",
      frameworkDetected: "vanilla",
      contentDensity: 800,
      provider: mockProvider({ throwError: "should_not_be_called" }),
      rawFetcher: mockFetcher(SAMPLE_RICH_SNAPSHOT),
      envOverrides: { enabled: true },
    });
    assert.equal(r.renderAttempted, null);
    assert.equal(r.renderSuccessful, null);
    assert.equal(r.rawTextLength, 4200);
    assert.deepEqual(r.rawSchemaTypes, ["LocalBusiness", "Organization"]);
  });
}

// ─── 4-7. Run paths ────────────────────────────────────────────────

async function runPathTests() {
  console.log("\n[4-7] Render runs / failures / deltas");
  await test("eligible + env enabled runs render and populates all fields", async () => {
    const r = await runRenderIntelligence({
      url: "https://compass.com",
      frameworkDetected: "nextjs",
      contentDensity: 250,
      provider: mockProvider({}),
      rawFetcher: mockFetcher(SAMPLE_SHELL_SNAPSHOT),
      envOverrides: { enabled: true },
    });
    assert.equal(r.renderAttempted, true);
    assert.equal(r.renderSuccessful, true);
    assert.equal(r.renderEngineVersion, MOCK_ENGINE);
    assert.equal(r.renderFailureReason, null);
    assert.equal(r.renderedTextLength, 3200);
    assert.deepEqual(r.renderedSchemaTypes, ["LocalBusiness", "Organization"]);
    assert.equal(r.hydrationDetected, true);
    // 3200 / 200 = 16x — well over content-delta + client-only thresholds.
    assert.equal(r.contentDeltaDetected, true);
    assert.equal(r.clientOnlyContentDetected, true);
    assert.equal(r.blankShellRisk, true);
    // Schema delta: rendered has 2 types, raw had 0 — delta true.
    assert.equal(r.schemaDeltaDetected, true);
    assert.equal(r.renderConfidence, "high");
  });
  await test("provider throw is captured in renderFailureReason; no rethrow", async () => {
    const r = await runRenderIntelligence({
      url: "https://compass.com",
      frameworkDetected: "nextjs",
      contentDensity: 250,
      provider: mockProvider({ throwError: "puppeteer_crashed" }),
      rawFetcher: mockFetcher(SAMPLE_SHELL_SNAPSHOT),
      envOverrides: { enabled: true },
    });
    assert.equal(r.renderAttempted, true);
    assert.equal(r.renderSuccessful, false);
    assert.match(r.renderFailureReason ?? "", /puppeteer_crashed/);
    assert.equal(r.rawTextLength, 200); // raw fetch survived
  });
  await test("raw fetch failure leaves render attempt intact (no comparison)", async () => {
    const r = await runRenderIntelligence({
      url: "https://compass.com",
      frameworkDetected: "nextjs",
      contentDensity: 250,
      provider: mockProvider({}),
      rawFetcher: mockFetcher("throw"),
      envOverrides: { enabled: true },
    });
    // Without a raw snapshot, eligibility falls back to framework
    // signal alone — should still trip on nextjs.
    assert.equal(r.renderAttempted, true);
    assert.equal(r.renderSuccessful, true);
    assert.equal(r.rawTextLength, null);
    assert.equal(r.rawSchemaTypes, null);
    assert.equal(r.contentDeltaDetected, null);
    assert.equal(r.schemaDeltaDetected, null);
  });
  await test("rich raw page + similar render → no content delta", async () => {
    const r = await runRenderIntelligence({
      url: "https://example.com",
      frameworkDetected: "nextjs",
      contentDensity: 250,
      provider: mockProvider({ output: { textLength: 4_300, schemaTypes: ["LocalBusiness", "Organization"] } }),
      rawFetcher: mockFetcher(SAMPLE_RICH_SNAPSHOT),
      envOverrides: { enabled: true },
    });
    assert.equal(r.renderAttempted, true);
    assert.equal(r.renderSuccessful, true);
    // 4300/4200 = 1.02 — well under 1.5× threshold
    assert.equal(r.contentDeltaDetected, false);
    // Same schema types — no delta
    assert.equal(r.schemaDeltaDetected, false);
  });
}

// ─── 8. parseRawSnapshot ───────────────────────────────────────────

async function rawSnapshotTests() {
  console.log("\n[8] parseRawSnapshot");
  await test("extracts schema types from JSON-LD", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"LocalBusiness","name":"Acme"}
        </script>
        <script type="application/ld+json">
        {"@graph":[{"@type":"Organization"},{"@type":"WebSite"}]}
        </script>
      </head><body><p>Acme Roofing serves Austin TX.</p></body></html>`;
    const snap = parseRawSnapshot(html);
    assert.ok(snap.schemaTypes.includes("LocalBusiness"));
    assert.ok(snap.schemaTypes.includes("Organization"));
    assert.ok(snap.schemaTypes.includes("WebSite"));
  });
  await test("flags shell when body is bare + #__next mount exists", () => {
    const html = `<html><body><div id="__next"></div></body></html>`;
    const snap = parseRawSnapshot(html);
    assert.equal(snap.looksLikeShell, true);
    assert.equal(snap.schemaTypes.length, 0);
  });
  await test("does not flag shell on content-rich body", () => {
    const html = `<html><body>${"Acme Roofing is a family-owned business serving central Texas. ".repeat(20)}</body></html>`;
    const snap = parseRawSnapshot(html);
    assert.equal(snap.looksLikeShell, false);
    assert.ok(snap.textLength > 400);
  });
}

// ─── 9-10. Force-flag paths ────────────────────────────────────────

async function forceFlagTests() {
  console.log("\n[9-10] Operator force flag");
  await test("operator force runs even with no signals", async () => {
    const r = await runRenderIntelligence({
      url: "https://example.com",
      frameworkDetected: "vanilla",
      contentDensity: 5_000,
      operatorForce: true,
      provider: mockProvider({}),
      rawFetcher: mockFetcher(SAMPLE_RICH_SNAPSHOT),
      envOverrides: { enabled: true },
    });
    assert.equal(r.renderAttempted, true);
    assert.equal(r.renderSuccessful, true);
  });
  await test("operator force bypasses env disabled", async () => {
    const r = await runRenderIntelligence({
      url: "https://example.com",
      frameworkDetected: "vanilla",
      contentDensity: 5_000,
      operatorForce: true,
      provider: mockProvider({}),
      rawFetcher: mockFetcher(SAMPLE_RICH_SNAPSHOT),
      envOverrides: { enabled: false },
    });
    assert.equal(r.renderAttempted, true);
    assert.equal(r.renderSuccessful, true);
  });
}

async function main() {
  await eligibilityTests();
  await skipPathTests();
  await runPathTests();
  await rawSnapshotTests();
  await forceFlagTests();
  console.log(
    `\n[stage2-render] passed=${passed} failed=${failed} total=${passed + failed}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
