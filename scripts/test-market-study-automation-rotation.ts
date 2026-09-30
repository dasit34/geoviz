/**
 * Tests the daily Market Study automation's rotation picker —
 * deterministic, stateless, no DB. Run:
 *   npx tsx scripts/test-market-study-automation-rotation.ts
 */
import {
  pickTodaysIndustryLocation,
  utcMidnight,
  type DailyAutomationConfig,
} from "@/lib/market-studies/automation/config";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

function config(overrides: Partial<DailyAutomationConfig>): DailyAutomationConfig {
  return {
    enabled: true,
    batchSize: 50,
    runHourUtc: 13,
    industries: ["hvac", "roofing", "dentist"],
    locations: [
      { city: "Columbus", state: "OH" },
      { city: "Austin", state: "TX" },
    ],
    discoveryProvider: "outscraper",
    qualifyConcurrency: 3,
    maxRetries: 3,
    costCeilingUsd: null,
    recipientEmail: null,
    ...overrides,
  };
}

// Deterministic: same day always picks the same industry/location.
{
  const day = new Date("2026-09-11T18:00:00.000Z");
  const a = pickTodaysIndustryLocation(config({}), day);
  const b = pickTodaysIndustryLocation(config({}), day);
  assert(JSON.stringify(a) === JSON.stringify(b), "same calendar day picks the same industry/location");
}

// Time-of-day independence — only the calendar day matters, not the hour.
{
  const morning = new Date("2026-09-11T01:00:00.000Z");
  const night = new Date("2026-09-11T23:59:00.000Z");
  const a = pickTodaysIndustryLocation(config({}), morning);
  const b = pickTodaysIndustryLocation(config({}), night);
  assert(JSON.stringify(a) === JSON.stringify(b), "same UTC day at different hours picks the same selection");
}

// Different days cover the full rotation over enough iterations.
{
  const cfg = config({});
  const seenIndustries = new Set<string>();
  const seenLocations = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + i));
    const pick = pickTodaysIndustryLocation(cfg, day);
    if (pick) {
      seenIndustries.add(pick.industry);
      seenLocations.add(`${pick.city},${pick.state}`);
    }
  }
  assert(seenIndustries.size === cfg.industries.length, "rotation covers every configured industry over enough days");
  assert(seenLocations.size === cfg.locations.length, "rotation covers every configured location over enough days");
}

// Misconfiguration (empty list) returns null, never throws/guesses.
{
  const pick = pickTodaysIndustryLocation(config({ industries: [] }));
  assert(pick === null, "empty industries list returns null, not a guess");
}
{
  const pick = pickTodaysIndustryLocation(config({ locations: [] }));
  assert(pick === null, "empty locations list returns null, not a guess");
}

// utcMidnight truncates to the UTC calendar day regardless of local time-of-day.
{
  const a = utcMidnight(new Date("2026-09-11T00:00:01.000Z"));
  const b = utcMidnight(new Date("2026-09-11T23:59:59.000Z"));
  assert(a.getTime() === b.getTime(), "utcMidnight collapses any time-of-day to the same instant for a given UTC day");
  assert(a.toISOString() === "2026-09-11T00:00:00.000Z", "utcMidnight produces exact UTC midnight");
}
{
  const a = utcMidnight(new Date("2026-09-11T12:00:00.000Z"));
  const b = utcMidnight(new Date("2026-09-12T12:00:00.000Z"));
  assert(a.getTime() !== b.getTime(), "utcMidnight distinguishes different calendar days");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
