/**
 * Daily Market Study automation — config.
 *
 * Same env-var convention as the rest of this codebase (see
 * `.env.example`'s "Internal lead generation" section): a master
 * `_ENABLED` flag, numeric knobs with sane defaults, no settings
 * table (none exists in this schema). Everything here is read fresh
 * on each call — no caching — since this only runs from a low-
 * frequency cron tick, not a hot path.
 */

export type DailyAutomationConfig = {
  enabled: boolean;
  batchSize: number;
  runHourUtc: number;
  industries: string[];
  locations: { city: string; state: string | null }[];
  discoveryProvider: string;
  qualifyConcurrency: number;
  maxRetries: number;
  costCeilingUsd: number | null;
  recipientEmail: string | null;
};

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function envFloat(name: string): number | null {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Comma-separated list, trimmed, empty entries dropped. */
function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** `"City, ST"` per entry — state is optional. */
function parseLocations(raw: string | undefined): { city: string; state: string | null }[] {
  return parseList(raw).map((entry) => {
    const [city, state] = entry.split(",").map((s) => s.trim());
    return { city: city ?? entry, state: state || null };
  });
}

export function loadDailyAutomationConfig(): DailyAutomationConfig {
  return {
    enabled: process.env.MARKET_STUDY_DAILY_AUTOMATION_ENABLED === "true",
    batchSize: envInt("MARKET_STUDY_DAILY_BATCH_SIZE", 50, 1, 200),
    runHourUtc: envInt("MARKET_STUDY_DAILY_RUN_HOUR_UTC", 13, 0, 23),
    industries: parseList(process.env.MARKET_STUDY_DAILY_INDUSTRIES),
    locations: parseLocations(process.env.MARKET_STUDY_DAILY_LOCATIONS),
    discoveryProvider: (process.env.MARKET_STUDY_DAILY_DISCOVERY_PROVIDER || "outscraper").trim(),
    qualifyConcurrency: envInt("MARKET_STUDY_DAILY_QUALIFY_CONCURRENCY", 3, 1, 10),
    maxRetries: envInt("MARKET_STUDY_DAILY_MAX_RETRIES", 3, 0, 10),
    costCeilingUsd: envFloat("MARKET_STUDY_DAILY_COST_CEILING_USD"),
    recipientEmail:
      process.env.MARKET_STUDY_DAILY_RECIPIENT_EMAIL?.trim() ||
      process.env.AUDIT_NOTIFICATION_EMAIL?.trim() ||
      null,
  };
}

/** Whole days since the Unix epoch, UTC — the only state rotation needs. */
function daysSinceEpochUtc(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

export type TodaysSelection = { industry: string; city: string; state: string | null };

/**
 * Deterministic, stateless rotation: the same calendar day always
 * picks the same industry/location, so a retry (or a second tick the
 * same day) never needs to remember "where it was" — it just re-
 * derives the same answer. Returns null when either list is empty
 * (misconfiguration — the caller should treat this as "nothing to do
 * today," not crash).
 */
export function pickTodaysIndustryLocation(
  config: DailyAutomationConfig,
  date: Date = new Date(),
): TodaysSelection | null {
  if (config.industries.length === 0 || config.locations.length === 0) return null;
  const day = daysSinceEpochUtc(date);
  const industry = config.industries[day % config.industries.length];
  const location = config.locations[day % config.locations.length];
  return { industry, city: location.city, state: location.state };
}

/** UTC-midnight for the given date — the daily uniqueness key. */
export function utcMidnight(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
