/**
 * Homepage offers — the single source for what the homepage may sell and
 * at what price. Server-only (reads env + Stripe).
 *
 * - $97 audit / $59 re-audit: fixed one-time prices (Stripe one-time
 *   prices behind STRIPE_PRICE_ID / STRIPE_REAUDIT_PRICE_ID).
 * - Monitoring: offered ONLY when GEO_MODULE_MONITORING_ENABLED is "true".
 *   Its price is read from the configured Stripe recurring price (never
 *   hard-coded); if Stripe can't be read, the card shows no number rather
 *   than a guess.
 */
import { configuredPlans, formatPlanPrice, isMonitoringEnabled } from "@/lib/monitoring/plans";
import { retrievePlanPrice } from "@/lib/monitoring/stripe-gateway";

export const AUDIT_PRICE = "$97";
export const AUDIT_REGULAR_PRICE = "$147";
export const REAUDIT_PRICE = "$59";
/** Monitoring price shown while monitoring is not yet open (planned Early Access price). */
export const MONITORING_PLANNED_PRICE = "$99";

export type MonitoringOffer =
  | { state: "launching_soon"; plannedPrice: string }
  | { state: "open"; amountLabel: string | null; intervalLabel: string | null };

export async function getMonitoringOffer(): Promise<MonitoringOffer> {
  if (!isMonitoringEnabled()) return { state: "launching_soon", plannedPrice: MONITORING_PLANNED_PRICE };
  const plan = configuredPlans()[0];
  if (!plan || !process.env.STRIPE_SECRET_KEY) return { state: "open", amountLabel: null, intervalLabel: null };
  try {
    const price = await retrievePlanPrice(plan.priceId);
    const display = price ? formatPlanPrice(price) : null;
    return { state: "open", amountLabel: display?.amountLabel ?? null, intervalLabel: display?.intervalLabel ?? null };
  } catch {
    return { state: "open", amountLabel: null, intervalLabel: null };
  }
}

export function monitoringIsOpen(): boolean {
  return isMonitoringEnabled();
}
