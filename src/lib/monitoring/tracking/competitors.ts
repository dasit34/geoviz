/**
 * Tracked-competitor rules (pure) + competitors detected in AI answers.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

import type { PlanEntitlements } from "../plans";
import { normalizeEntityName, type EntityMatcher } from "./detector";
import type { ResultForMetrics } from "./types";

export type CompetitorAddDecision =
  | { ok: true; name: string; normalizedName: string; websiteUrl: string | null; domain: string | null }
  | { ok: false; reason: "not_entitled" | "limit_reached" | "duplicate" | "invalid" | "is_customer"; message: string };

export function decideCompetitorAdd(args: {
  name: string;
  websiteUrl?: string | null;
  activeNormalized: string[];
  entitlements: PlanEntitlements;
  customer: EntityMatcher;
}): CompetitorAddDecision {
  const name = args.name.replace(/\s+/g, " ").trim();
  const normalizedName = normalizeEntityName(name);
  const limit = args.entitlements.maxCompetitors;
  if (limit <= 0) return { ok: false, reason: "not_entitled", message: "Your plan doesn't include competitor tracking." };
  if (normalizedName.length < 2 || name.length > 120) return { ok: false, reason: "invalid", message: "Enter the competitor's business name." };
  if (args.customer.matchName(name)) return { ok: false, reason: "is_customer", message: "That looks like your own business." };
  if (args.activeNormalized.includes(normalizedName)) return { ok: false, reason: "duplicate", message: "You're already tracking that competitor." };
  if (args.activeNormalized.length >= limit) {
    return { ok: false, reason: "limit_reached", message: `Your plan tracks up to ${limit} competitors. Remove one to add another.` };
  }
  const rawUrl = args.websiteUrl?.trim() || null;
  const websiteUrl = rawUrl ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`) : null;
  return { ok: true, name, normalizedName, websiteUrl, domain: normalizeDomain(websiteUrl) };
}

export type DetectedCompetitor = { name: string; normalizedName: string; answers: number; providers: string[] };

/** Businesses AI named instead of / alongside the customer, most frequent first. */
export function detectCompetitors(
  results: Array<ResultForMetrics & { namedBusinesses: string[] }>,
  customer: EntityMatcher,
  trackedNormalized: string[],
  limit = 8,
): DetectedCompetitor[] {
  const tracked = new Set(trackedNormalized);
  const agg = new Map<string, DetectedCompetitor>();
  for (const r of results) {
    if (r.status !== "measured") continue;
    for (const raw of new Set(r.namedBusinesses)) {
      if (customer.matchName(raw)) continue;
      const n = normalizeEntityName(raw);
      if (n.length < 3 || tracked.has(n)) continue;
      const d = agg.get(n) ?? { name: raw.trim(), normalizedName: n, answers: 0, providers: [] };
      d.answers += 1;
      if (!d.providers.includes(r.provider)) d.providers.push(r.provider);
      agg.set(n, d);
    }
  }
  return [...agg.values()].sort((a, b) => b.answers - a.answers || a.name.localeCompare(b.name)).slice(0, limit);
}
