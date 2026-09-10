/* eslint-disable no-console */
/**
 * scripts/test-market-study-internal-email.ts
 *
 * Guards the customer-contact suppression for market-study audits:
 *   - the worker's customer failure/delay email (via isCalibrationOrder)
 *   - the operator "report ready for review" ping
 * plus isMarketStudyOrder. Pure, no DB.
 *
 *   npx tsx scripts/test-market-study-internal-email.ts
 */
import assert from "node:assert/strict";

import { isCalibrationOrder } from "../src/lib/customer-failure-mapping";
import { isMarketStudyOrder } from "../src/lib/market-studies/isMarketStudyOrder";
import { notifyOperatorReportReady } from "../src/lib/notify-operator-report-ready";
import {
  MARKET_STUDY_AUDIT_EMAIL,
  MARKET_STUDY_SESSION_PREFIX,
} from "../src/lib/market-studies/constants";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}`);
    failures.push(label);
    failed += 1;
  }
}

async function main() {
  console.log("[market-study-internal-email] running...");

  check(
    "market-study email suppresses customer emails",
    isCalibrationOrder(MARKET_STUDY_AUDIT_EMAIL) === true,
  );
  check(
    "calibration email still suppresses (no regression)",
    isCalibrationOrder("calibration@geoviz.invalid") === true,
  );
  check(
    "a real customer email does NOT suppress",
    isCalibrationOrder("jane@example.com") === false,
  );
  check("null email is safe", isCalibrationOrder(null) === false);

  check(
    "isMarketStudyOrder matches the session prefix",
    isMarketStudyOrder(`${MARKET_STUDY_SESSION_PREFIX}abc123`) === true,
  );
  check(
    "isMarketStudyOrder rejects calibration / stripe sessions",
    isMarketStudyOrder("calibration_abc") === false &&
      isMarketStudyOrder("cs_live_xyz") === false &&
      isMarketStudyOrder(null) === false,
  );

  // The worker skips the operator "ready for review" email for
  // market-study audits (a 25-lead study would otherwise send 25).
  const skipped = await notifyOperatorReportReady({
    orderId: "o1",
    businessName: "Rick's Roofing",
    customerEmail: MARKET_STUDY_AUDIT_EMAIL,
    websiteUrl: "https://ricksroofing.com",
    reportMarkdown: "# report",
    reportGeneratedAt: new Date(),
    stripeSessionId: `${MARKET_STUDY_SESSION_PREFIX}abc`,
  });
  check(
    "notifyOperatorReportReady returns false (skips) for a market-study order",
    skipped === false,
  );

  assert.equal(failed, 0);
}

main()
  .then(() => {
    console.log(`[market-study-internal-email] passed=${passed} failed=0`);
  })
  .catch(() => {
    console.log(
      `[market-study-internal-email] FAILED — passed=${passed} failed=${failed}`,
    );
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  });
