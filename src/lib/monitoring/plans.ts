/**
 * Monitoring plan catalog.
 *
 * Pricing is NOT defined in code. Each plan points at a Stripe recurring
 * price through an env var, following the existing one-time conventions
 * (`STRIPE_PRICE_ID` for the $97 audit, `STRIPE_REAUDIT_PRICE_ID` for
 * the $59 re-audit). The amount shown to customers is read from the
 * Stripe price object at render time; a plan whose env var is unset —
 * or whose Stripe price isn't recurring — is simply not offered.
 *
 * Documented pricing guidance (docs/strategy/01_FIVE_YEAR_ROADMAP.md,
 * docs/REVENUE_ROADMAP.md): Monitoring $29–79/mo at Stage 2. The exact
 * amount is whatever the Stripe price is set to.
 */

/** Tracking providers the runner knows how to call (src/lib/monitoring/tracking/providers.ts). */
export type TrackingProvider = "claude" | "openai" | "gemini" | "perplexity";
export const ALL_TRACKING_PROVIDERS: readonly TrackingProvider[] = ["claude", "openai", "gemini", "perplexity"];

/**
 * What a plan grants. Feature code reads ONLY these numbers — never the
 * plan key or price — so a future plan changes limits here, not in logic.
 */
export type PlanEntitlements = {
  /** Scheduled full GeoViz re-audits per billing cycle (via the existing pipeline). */
  fullReauditsPerCycle: number;
  historicalScoreTracking: boolean;
  /** Max simultaneously active tracked prompts (0 = prompt tracking off). */
  maxActivePrompts: number;
  /** Max simultaneously active tracked competitors (0 = competitor tracking off). */
  maxCompetitors: number;
  citationTracking: boolean;
  reportHistory: boolean;
  /** Which AI providers tracked prompts run against. */
  providers: readonly TrackingProvider[];
  /** Independent samples per (question, AI system) per cycle — answers vary run to run. */
  samplesPerPrompt: number;
  /** Website snapshots + change detection (src/lib/monitoring/website/). */
  websiteTracking: WebsiteTrackingEntitlement;
};

export type WebsiteTrackingEntitlement = {
  enabled: boolean;
  /** Pages captured per site per scan (homepage included). */
  maxPagesPerSite: number;
  /** Sitemap <loc> entries read per site per scan. */
  maxSitemapUrlsRead: number;
  /** Confirmed competitor websites scanned per cycle (in addition to the customer's). */
  maxCompetitorSites: number;
};

export type MonitoringPlan = {
  key: string;
  name: string;
  description: string;
  /** Days between scheduled monitoring cycles (re-audit + prompt tracking). */
  cadenceDays: number;
  /** Env var holding the Stripe recurring price id. */
  priceEnvVar: string;
  entitlements: PlanEntitlements;
};

/** Early Access limits — the monthly plan today. */
export const EARLY_ACCESS_ENTITLEMENTS: PlanEntitlements = {
  fullReauditsPerCycle: 1,
  historicalScoreTracking: true,
  maxActivePrompts: 10,
  maxCompetitors: 3,
  citationTracking: true,
  reportHistory: true,
  providers: ALL_TRACKING_PROVIDERS,
  samplesPerPrompt: 2,
  websiteTracking: { enabled: true, maxPagesPerSite: 12, maxSitemapUrlsRead: 200, maxCompetitorSites: 3 },
};

export const MONITORING_PLANS: readonly MonitoringPlan[] = [
  {
    key: "monthly",
    name: "Monthly AI Visibility Monitoring",
    description:
      "A fresh AI visibility audit every month plus tracked customer questions, competitor comparison, and citation tracking across AI systems.",
    cadenceDays: 30,
    priceEnvVar: "STRIPE_MONITORING_MONTHLY_PRICE_ID",
    entitlements: EARLY_ACCESS_ENTITLEMENTS,
  },
];

/** Default cadence when a subscription's plan key is no longer in the catalog. */
export const DEFAULT_CADENCE_DAYS = 30;

export type ResolvedPlan = MonitoringPlan & { priceId: string };

type Env = Record<string, string | undefined>;

export function findPlan(key: string | null | undefined): MonitoringPlan | null {
  return MONITORING_PLANS.find((p) => p.key === key) ?? null;
}

/** Plan + its configured Stripe price id, or null when not configured. */
export function resolvePlan(key: string | null | undefined, env: Env = process.env): ResolvedPlan | null {
  const plan = findPlan(key);
  if (!plan) return null;
  const priceId = env[plan.priceEnvVar]?.trim();
  return priceId ? { ...plan, priceId } : null;
}

export function configuredPlans(env: Env = process.env): ResolvedPlan[] {
  return MONITORING_PLANS.map((p) => resolvePlan(p.key, env)).filter(
    (p): p is ResolvedPlan => p !== null,
  );
}

/**
 * Entitlements for a subscription's plan key. A key no longer in the
 * catalog keeps Early Access limits (never silently strips a paying
 * customer's features).
 */
export function entitlementsForPlan(key: string | null | undefined): PlanEntitlements {
  return findPlan(key)?.entitlements ?? EARLY_ACCESS_ENTITLEMENTS;
}

export function cadenceDaysForPlan(key: string | null | undefined): number {
  return findPlan(key)?.cadenceDays ?? DEFAULT_CADENCE_DAYS;
}

/** Feature flag — the documented module flag for /monitoring. Off unless exactly "true". */
export function isMonitoringEnabled(env: Env = process.env): boolean {
  return env.GEO_MODULE_MONITORING_ENABLED === "true";
}

/** Display price read from the Stripe price object — never hardcoded. */
export type PlanPriceDisplay = {
  amountLabel: string;
  intervalLabel: string;
};

export function formatPlanPrice(price: {
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
}): PlanPriceDisplay | null {
  if (price.unit_amount === null || !price.recurring) return null;
  const amountLabel = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.unit_amount % 100 === 0 ? 0 : 2,
  }).format(price.unit_amount / 100);
  const { interval, interval_count } = price.recurring;
  const intervalLabel = interval_count === 1 ? `per ${interval}` : `every ${interval_count} ${interval}s`;
  return { amountLabel, intervalLabel };
}
