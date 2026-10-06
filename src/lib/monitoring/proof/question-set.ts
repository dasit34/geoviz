/**
 * Proof Engine v1 — the fixed measurement baseline.
 *
 * A TrackingQuestionSet is a versioned, reviewable set of up to 10
 * monitoring questions, each classified by intent. The lifecycle is
 * draft → approved → active → retired:
 *   - Items are editable ONLY while the set is a draft that has never been
 *     measured. Approval freezes the wording.
 *   - Activation retires the previously active set and syncs TrackedPrompt
 *     rows: the set's questions are created or reactivated (text is never
 *     edited — TrackedPrompt text is immutable), questions outside the set are
 *     deactivated (history kept).
 *   - Any change after approval is a NEW version (cloneAsDraft → n+1), so
 *     results measured against a version stay comparable to that version.
 *
 * Proposals are deterministic templates (no LLM). They never invent a city,
 * service area, service, or competitor: local and competitor questions are
 * only proposed when that context was actually supplied.
 */
import { cleanPromptText, normalizePromptText, PROMPT_MAX_LENGTH, PROMPT_MIN_LENGTH } from "../tracking/prompts";

export const QUESTION_SET_GENERATOR_VERSION = "proof-questions@1.0.0";
export const MAX_QUESTIONS_PER_SET = 10;

export const QUESTION_INTENTS = [
  "branded_accuracy",
  "unbranded_discovery",
  "service_specific",
  "local_commercial_intent",
  "competitor_comparison",
] as const;
export type QuestionIntent = (typeof QUESTION_INTENTS)[number];

export const INTENT_LABELS: Record<QuestionIntent, string> = {
  branded_accuracy: "Branded accuracy — does AI describe the business correctly?",
  unbranded_discovery: "Unbranded discovery — is the business named when it isn't mentioned?",
  service_specific: "Service-specific — is it named for a specific service?",
  local_commercial_intent: "Local commercial intent — is it named for a local buying question?",
  competitor_comparison: "Competitor comparison — how is it described against a named competitor?",
};

export type QuestionSetStatus = "draft" | "approved" | "active" | "retired";

export type QuestionSetContext = {
  businessName: string;
  /** Singular category noun phrase, e.g. "roofing contractor" or "AI visibility software". */
  businessCategory: string;
  /** Optional plural; defaults to "<category> providers". */
  categoryPlural?: string | null;
  services?: string[];
  city?: string | null;
  state?: string | null;
  serviceArea?: string | null;
  isLocal: boolean;
  /** Real competitor names only (tracked or supplied) — never invented. */
  competitorNames?: string[];
};

export type ProposedQuestion = { text: string; intent: QuestionIntent; rationale: string };

export type QuestionSetItemRecord = {
  id: string;
  position: number;
  text: string;
  normalizedText: string;
  intent: QuestionIntent;
  rationale: string | null;
  trackedPromptId: string | null;
};

export type QuestionSetRecord = {
  id: string;
  subscriptionId: string;
  version: number;
  status: QuestionSetStatus;
  businessCategory: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  generatorVersion: string;
  notes: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  activatedAt: Date | null;
  firstMeasuredAt: Date | null;
  retiredAt: Date | null;
  items: QuestionSetItemRecord[];
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
/** Simple English plural of the category's last word ("HVAC company" → "HVAC companies"). */
const pluralize = (s: string) =>
  s.replace(/(\w+)$/, (w) => (/[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/i.test(w) ? `${w}es` : `${w}s`));
/** "an" before a vowel sound, including spelled-out acronyms ("an HVAC company", "an AI service"). */
const articleFor = (s: string) => {
  const first = s.split(" ")[0] ?? "";
  const acronym = first.length > 1 && first === first.toUpperCase() && /[A-Z]/.test(first);
  return (acronym ? /^[AEFHILMNORSX]/.test(first) : /^[aeiou]/i.test(first)) ? "an" : "a";
};
/** Lowercase for use mid-sentence, keeping acronyms ("AI", "HVAC") intact. */
const lowerWords = (s: string) => s.split(" ").map((w) => (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w : w.toLowerCase())).join(" ");

function place(ctx: QuestionSetContext): string | null {
  const city = clean(ctx.city);
  const state = clean(ctx.state);
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  const area = clean(ctx.serviceArea);
  if (area) return area;
  return state || null;
}

/** Deterministic proposal of up to 10 intent-classified questions. */
export function proposeQuestionSet(ctx: QuestionSetContext): ProposedQuestion[] {
  const name = clean(ctx.businessName);
  const category = lowerWords(clean(ctx.businessCategory));
  if (!name || !category) return [];
  const plural = lowerWords(clean(ctx.categoryPlural)) || pluralize(category);
  const services = (ctx.services ?? []).map(clean).filter((s) => s.length >= 3).slice(0, 2);
  const where = ctx.isLocal ? place(ctx) : null;
  const competitors = (ctx.competitorNames ?? []).map(clean).filter(Boolean).slice(0, 2);
  const article = articleFor(category);

  const out: ProposedQuestion[] = [];
  const add = (text: string, intent: QuestionIntent, rationale: string) => out.push({ text: cleanPromptText(text), intent, rationale });

  add(`What does ${name} do, and who is it for?`, "branded_accuracy", "Checks whether AI describes the business accurately when asked by name.");
  add(`Is ${name} a trustworthy ${category}?`, "branded_accuracy", "Checks how AI characterises the business's credibility when asked by name.");

  if (where) {
    add(`Who are the best ${plural} in ${where}?`, "unbranded_discovery", "Checks whether the business is named for its category without being mentioned.");
    add(`Can you recommend ${article} ${category} in ${where}?`, "local_commercial_intent", "A local buying question in the business's stated area.");
  } else {
    add(`What are the best ${plural}?`, "unbranded_discovery", "Checks whether the business is named for its category without being mentioned.");
    add(`Can you recommend a reliable ${category}?`, "unbranded_discovery", "A buying question for the category, without a location.");
  }

  for (const service of services) {
    const svc = lowerWords(service);
    if (where) add(`Who offers ${svc} in ${where}?`, "local_commercial_intent", `A local buying question for "${service}" in the stated area.`);
    // "Which AI visibility audit services are best for AI visibility audit?" reads badly — ask directly when the service restates the category.
    const stems = (t: string) => t.toLowerCase().split(" ").map((w) => w.replace(/s$/, ""));
    const categoryStems = new Set(stems(category));
    const restatesCategory = stems(svc).every((w) => categoryStems.has(w));
    add(restatesCategory ? `Who offers ${svc}?` : `Which ${plural} are best for ${svc}?`, "service_specific", `Checks whether the business is named for "${service}".`);
  }

  for (const competitor of competitors) {
    add(`How does ${name} compare to ${competitor}?`, "competitor_comparison", `Compares the business with ${competitor}, a competitor that was actually supplied.`);
  }

  add(`What should I look for when choosing ${article} ${category}?`, "unbranded_discovery", "A research-stage question for the category; shows which businesses and sources AI cites.");

  const seen = new Set<string>();
  return out
    .filter((q) => q.text.length >= PROMPT_MIN_LENGTH && q.text.length <= PROMPT_MAX_LENGTH)
    .filter((q) => {
      const k = normalizePromptText(q.text);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_QUESTIONS_PER_SET);
}

// ── Lifecycle rules (pure) ────────────────────────────────────────────

export type Decision = { ok: true } | { ok: false; reason: string };

export const FROZEN_MESSAGE = "This question set is approved or has been measured, so its questions can't change. Create a new version instead.";

/** Items may change only while the set is an unmeasured draft. */
export function canEditItems(set: Pick<QuestionSetRecord, "status" | "firstMeasuredAt">): boolean {
  return set.status === "draft" && set.firstMeasuredAt === null;
}

export function validateItems(items: Array<{ text: string; intent: string }>): Decision {
  if (items.length === 0) return { ok: false, reason: "A question set needs at least one question." };
  if (items.length > MAX_QUESTIONS_PER_SET) return { ok: false, reason: `A question set can have at most ${MAX_QUESTIONS_PER_SET} questions.` };
  const seen = new Set<string>();
  for (const item of items) {
    const text = cleanPromptText(item.text);
    if (text.length < PROMPT_MIN_LENGTH || text.length > PROMPT_MAX_LENGTH) {
      return { ok: false, reason: `Each question needs ${PROMPT_MIN_LENGTH}–${PROMPT_MAX_LENGTH} characters.` };
    }
    if (!(QUESTION_INTENTS as readonly string[]).includes(item.intent)) return { ok: false, reason: `Unknown question intent "${item.intent}".` };
    const k = normalizePromptText(text);
    if (seen.has(k)) return { ok: false, reason: "The set contains the same question twice." };
    seen.add(k);
  }
  return { ok: true };
}

export function decideEditItems(set: Pick<QuestionSetRecord, "status" | "firstMeasuredAt">, items: Array<{ text: string; intent: string }>): Decision {
  if (!canEditItems(set)) return { ok: false, reason: FROZEN_MESSAGE };
  return validateItems(items);
}

export function decideApprove(set: Pick<QuestionSetRecord, "status" | "firstMeasuredAt" | "items">): Decision {
  if (set.status !== "draft") return { ok: false, reason: `Only a draft can be approved (this set is ${set.status}).` };
  return validateItems(set.items);
}

export function decideActivate(set: Pick<QuestionSetRecord, "status">): Decision {
  if (set.status !== "approved") return { ok: false, reason: `Only an approved set can be activated (this set is ${set.status}).` };
  return { ok: true };
}

export type ActivationSync = {
  /** Existing prompts (any state) whose text matches a set question → active, linked. */
  link: Array<{ itemNormalizedText: string; trackedPromptId: string; reactivate: boolean }>;
  /** Set questions with no existing prompt → create. */
  create: Array<{ text: string; normalizedText: string }>;
  /** Active prompts not in the set → deactivate (never deleted, text never edited). */
  deactivate: string[];
};

/** Which TrackedPrompts to link, create, and deactivate when a set goes active. */
export function planActivationSync(
  items: Array<Pick<QuestionSetItemRecord, "text" | "normalizedText">>,
  prompts: Array<{ id: string; normalizedText: string; isActive: boolean }>,
): ActivationSync {
  const byText = new Map(prompts.map((p) => [p.normalizedText, p]));
  const wanted = new Set(items.map((i) => i.normalizedText));
  const link: ActivationSync["link"] = [];
  const create: ActivationSync["create"] = [];
  for (const item of items) {
    const existing = byText.get(item.normalizedText);
    if (existing) link.push({ itemNormalizedText: item.normalizedText, trackedPromptId: existing.id, reactivate: !existing.isActive });
    else create.push({ text: cleanPromptText(item.text), normalizedText: item.normalizedText });
  }
  const deactivate = prompts.filter((p) => p.isActive && !wanted.has(p.normalizedText)).map((p) => p.id);
  return { link, create, deactivate };
}

/** Items for a new draft version copied from an existing set (wording preserved, links dropped). */
export function cloneItems(set: Pick<QuestionSetRecord, "items">): Array<{ text: string; intent: QuestionIntent; rationale: string | null }> {
  return [...set.items].sort((a, b) => a.position - b.position).map((i) => ({ text: i.text, intent: i.intent, rationale: i.rationale }));
}

// ── Store ─────────────────────────────────────────────────────────────

export type NewItem = { text: string; intent: QuestionIntent; rationale: string | null };
export type DraftContext = {
  businessCategory: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  generatorVersion: string;
  notes: string | null;
};

/**
 * Persistence for question sets. EVERY method is scoped by subscriptionId:
 * a set that belongs to another subscription is treated as not found.
 * Conditional writes enforce the lifecycle at the storage layer too.
 */
export interface QuestionSetStore {
  listSets(subscriptionId: string): Promise<QuestionSetRecord[]>;
  getSet(subscriptionId: string, setId: string): Promise<QuestionSetRecord | null>;
  activeSet(subscriptionId: string): Promise<QuestionSetRecord | null>;
  createDraft(subscriptionId: string, context: DraftContext, items: NewItem[], now: Date): Promise<QuestionSetRecord>;
  /** Only succeeds while the set is an unmeasured draft. */
  replaceDraftItems(subscriptionId: string, setId: string, items: NewItem[]): Promise<boolean>;
  /** draft → approved; returns false if the set wasn't a draft. */
  approve(subscriptionId: string, setId: string, by: string, now: Date): Promise<boolean>;
  /** approved → active, retiring the previous active set and syncing TrackedPrompts, atomically. */
  activate(subscriptionId: string, setId: string, now: Date): Promise<boolean>;
  markFirstMeasured(subscriptionId: string, setId: string, now: Date): Promise<void>;
}

/** Normalised item rows for a new draft (positions assigned in order). */
export function toItemRows(items: NewItem[]): Array<NewItem & { position: number; normalizedText: string }> {
  return items.map((i, idx) => ({ ...i, text: cleanPromptText(i.text), position: idx + 1, normalizedText: normalizePromptText(i.text) }));
}

/** Parses "intent | question | rationale" lines from the draft editor. */
export function parseDraftItems(raw: string): NewItem[] | string {
  const items: NewItem[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [intent, text, rationale] = line.split("|").map((p) => p.trim());
    if (!intent || !text) return `Each line needs "intent | question": ${line.slice(0, 80)}`;
    if (!(QUESTION_INTENTS as readonly string[]).includes(intent)) return `Unknown intent "${intent.slice(0, 40)}".`;
    items.push({ text, intent: intent as QuestionIntent, rationale: rationale || "Edited by the operator." });
  }
  return items;
}
