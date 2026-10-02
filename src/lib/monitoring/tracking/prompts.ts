/**
 * Tracked-prompt rules (pure): validation, de-duplication, plan limits,
 * and suggestions built with the existing report question generator.
 */
import { buildCustomerQuestions } from "@/lib/report/customer-questions";

import type { PlanEntitlements } from "../plans";
import { normalizeEntityName } from "./detector";

export const PROMPT_MIN_LENGTH = 10;
export const PROMPT_MAX_LENGTH = 300;

export function cleanPromptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizePromptText(text: string): string {
  return cleanPromptText(text).toLowerCase().replace(/[?.!]+$/, "");
}

export type PromptAddDecision =
  | { ok: true; text: string; normalizedText: string }
  | { ok: false; reason: "not_entitled" | "limit_reached" | "duplicate" | "too_short" | "too_long"; message: string };

export function decidePromptAdd(args: {
  text: string;
  activeNormalized: string[];
  entitlements: PlanEntitlements;
}): PromptAddDecision {
  const text = cleanPromptText(args.text);
  const normalizedText = normalizePromptText(text);
  const limit = args.entitlements.maxActivePrompts;
  if (limit <= 0) return { ok: false, reason: "not_entitled", message: "Your plan doesn't include question tracking." };
  if (text.length < PROMPT_MIN_LENGTH) return { ok: false, reason: "too_short", message: `Questions need at least ${PROMPT_MIN_LENGTH} characters.` };
  if (text.length > PROMPT_MAX_LENGTH) return { ok: false, reason: "too_long", message: `Questions can be at most ${PROMPT_MAX_LENGTH} characters.` };
  if (args.activeNormalized.includes(normalizedText)) return { ok: false, reason: "duplicate", message: "You're already tracking that question." };
  if (args.activeNormalized.length >= limit) {
    return { ok: false, reason: "limit_reached", message: `Your plan tracks up to ${limit} questions. Remove one to add another.` };
  }
  return { ok: true, text, normalizedText };
}

export type SuggestionContext = {
  businessName: string;
  industrySlug: string | null;
  city: string | null;
  services: string[];
  businessType: string | null;
};

/**
 * Pull city / services / business type out of the latest audit's
 * already-captured provider outputs (`AuditIntelligence.aiValidations`) —
 * no new provider calls. Mirrors report-model.ts's derivation.
 */
export function extractSuggestionContext(args: {
  businessName: string;
  industrySlug: string | null;
  aiValidations: unknown;
}): SuggestionContext {
  const outputs = Array.isArray((args.aiValidations as { outputs?: unknown })?.outputs)
    ? ((args.aiValidations as { outputs: Array<Record<string, unknown>> }).outputs)
    : [];
  const str = (v: unknown) => (typeof v === "string" && v.trim().length > 0 && !/^(unknown|not (specified|available|provided))/i.test(v.trim()) ? v.trim() : null);
  const city = outputs.map((o) => str(o.location_identified)).find((v) => v) ?? null;
  const businessType = outputs.map((o) => str(o.industry_identified)).find((v) => v) ?? null;
  const services = Array.from(
    new Set(outputs.flatMap((o) => (Array.isArray(o.services_identified) ? o.services_identified : [])).map((s) => str(s)).filter((s): s is string => !!s)),
  );
  return { businessName: args.businessName, industrySlug: args.industrySlug, city, services, businessType };
}

/**
 * Suggested discovery questions. Questions that name the business are
 * dropped — they'd measure brand recall, not whether AI recommends the
 * business to someone who doesn't know it yet.
 */
export function suggestPrompts(ctx: SuggestionContext, alreadyTracked: string[] = []): string[] {
  const base = buildCustomerQuestions({
    businessName: ctx.businessName,
    industrySlug: ctx.industrySlug,
    city: ctx.city,
    services: ctx.services,
    businessType: ctx.businessType,
    isLocal: ctx.city !== null,
  });
  const brand = normalizeEntityName(ctx.businessName);
  const tracked = new Set(alreadyTracked);
  return base
    .map(cleanPromptText)
    .filter((q) => !brand || !` ${normalizeEntityName(q)} `.includes(` ${brand} `))
    .filter((q) => !tracked.has(normalizePromptText(q)));
}
