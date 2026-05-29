/* eslint-disable no-console */
/**
 * scripts/test-customer-success-safety.ts
 *
 *   npm run test:customer-success-safety
 *
 * Locks the invariants the customer "Report ready" success-delivery
 * email must uphold before paid launch:
 *
 *   1. CUSTOMER_SUCCESS_SUBJECT is the verbatim G2-prompt locked
 *      string. No score chip, no business name, no version suffix.
 *   2. The plain-text body contains the report URL exactly once.
 *   3. The HTML body contains the report URL exactly once (as an
 *      anchor href).
 *   4. Both bodies sign off with "— GeoViz".
 *   5. Both bodies mention the business label + website URL (so the
 *      customer recognizes the email).
 *   6. Both bodies contain ZERO leaks: no provider names, no model
 *      names, no billing/cap language, no internal jargon, no score
 *      numbers, no blame-toned phrasing. Same regex set as the
 *      failure-safety test, plus score-leak guards.
 *   7. sendCustomerSuccessEmail returns false (no throw) when
 *      RESEND_API_KEY is unset — fail-soft contract preserved.
 *   8. Subject is identical for every business label (no per-order
 *      personalization that could leak metadata).
 */

import assert from "node:assert/strict";
import {
  CUSTOMER_SUCCESS_SUBJECT,
  buildCustomerSuccessTexts,
  sendCustomerSuccessEmail,
} from "../src/lib/customer-emails";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> | void {
  const onErr = (err: unknown) => {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n      ${message}`);
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passed += 1;
          console.log(`  ✓ ${name}`);
        })
        .catch(onErr);
    }
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    onErr(err);
  }
}

const SAMPLE_ORDER = {
  businessLabel: "North Coast Roofing",
  websiteUrl: "https://northcoastroofing.com",
  reportUrl: "https://geoviz.ai/report/ord_abc123/print",
};

const FORBIDDEN_PHRASES: RegExp[] = [
  // Provider / model names
  /anthropic/i,
  /openai/i,
  /claude\b/i,
  /gpt[-\s]/i,
  /perplexity/i,
  /\bgemini\b/i,
  // Billing / cap / quota language
  /\bcap\b|\bquota\b|spend(?:ing)?\s+limit|\bapi (?:key|usage)\b|\bbilling\b/i,
  // Internal jargon / status codes
  /\b5\d\d\b|\b4\d\d\b|\bjson\b|\bprisma\b|stack trace|\bsdk\b|api error/i,
  // Score leakage — this email is intentionally score-free; the
  // customer opens the report URL to see their score
  /\b\d{1,3}\s*\/\s*100\b|score:\s*\d/i,
  // Blame
  /your fault|you should|you must/i,
  // Hype words banned by CLAUDE.md tone rules
  /supercharge|game[-\s]?chang|revolutionary|10x|guaranteed/i,
];

async function run(): Promise<void> {
  console.log("\n[1] Subject lock");
  test("subject is the verbatim G2 string", () => {
    assert.equal(CUSTOMER_SUCCESS_SUBJECT, "Your AI Visibility Report is ready");
  });

  console.log("\n[2-5] Body shape");
  const { text, html } = buildCustomerSuccessTexts(SAMPLE_ORDER);

  test("plain-text body contains the report URL", () => {
    const occurrences = text.split(SAMPLE_ORDER.reportUrl).length - 1;
    assert.equal(
      occurrences,
      1,
      `expected exactly 1 reportUrl occurrence in text body, got ${occurrences}`,
    );
  });
  test("html body contains the report URL", () => {
    const occurrences = html.split(SAMPLE_ORDER.reportUrl).length - 1;
    assert.equal(
      occurrences,
      1,
      `expected exactly 1 reportUrl occurrence in html body, got ${occurrences}`,
    );
  });
  test("plain-text body signs off with — GeoViz", () => {
    assert.ok(/—\s*GeoViz\s*$/.test(text.trim()));
  });
  test("html body signs off with — GeoViz", () => {
    assert.ok(/—\s*GeoViz/.test(html));
  });
  test("plain-text body mentions the business label + website URL", () => {
    assert.ok(text.includes(SAMPLE_ORDER.businessLabel));
    assert.ok(text.includes(SAMPLE_ORDER.websiteUrl));
  });
  test("html body mentions the business label + website URL", () => {
    assert.ok(html.includes(SAMPLE_ORDER.businessLabel));
    assert.ok(html.includes(SAMPLE_ORDER.websiteUrl));
  });

  console.log("\n[6] Forbidden-phrase scan");
  // For the HTML body we scan visible text only — style attributes
  // contain CSS pixel values (e.g. `560px`, `font-weight:700`) that
  // would false-positive the HTTP-status regex. The customer never
  // sees the CSS, so it's not a leak surface.
  const htmlVisible = html
    .replace(/style="[^"]*"/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const rx of FORBIDDEN_PHRASES) {
    test(`plain-text body has no match for ${rx.source}`, () => {
      assert.ok(
        !rx.test(text),
        `plain text leaked: ${rx.source}\n  --- text ---\n${text}\n  ---`,
      );
    });
    test(`html (visible) body has no match for ${rx.source}`, () => {
      assert.ok(
        !rx.test(htmlVisible),
        `html visible content leaked: ${rx.source}\n  --- htmlVisible ---\n${htmlVisible}\n  ---`,
      );
    });
  }

  console.log("\n[7] Fail-soft when RESEND_API_KEY unset");
  await test("sendCustomerSuccessEmail returns false when RESEND_API_KEY is missing", async () => {
    const savedKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const result = await sendCustomerSuccessEmail({
        orderId: "ord_fail_soft_test",
        businessName: "Test Co",
        customerEmail: "test@example.com",
        websiteUrl: "https://example.com",
      });
      assert.equal(
        result,
        false,
        "expected false when RESEND_API_KEY is missing, not a throw",
      );
    } finally {
      if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;
    }
  });

  console.log("\n[8] Subject is identical across orders");
  test("subject does not vary with business name or URL", () => {
    // Subject is a top-level const, no per-call rendering. This test
    // catches a future regression if someone adds dynamic subject
    // composition.
    assert.equal(CUSTOMER_SUCCESS_SUBJECT, "Your AI Visibility Report is ready");
    // Sanity: no template tokens
    assert.ok(!/\$\{|<%|{{/.test(CUSTOMER_SUCCESS_SUBJECT));
  });

  console.log(
    `\n[customer-success-safety] passed=${passed} failed=${failed} total=${passed + failed}`,
  );
  if (failed > 0) process.exit(1);
}

void run();
