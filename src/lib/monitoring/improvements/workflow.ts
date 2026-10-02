/**
 * Improvement-task status machine + recommendation → task mapping (pure).
 *
 *   suggested → approved | dismissed
 *   approved → in_progress | implemented | dismissed
 *   in_progress → implemented | dismissed
 *   implemented → verified (system check, or operator for manual-only kinds) | in_progress (reopen)
 *   dismissed → suggested (restore)
 *
 * "Implemented" is a claim by the customer or operator. "Verified" needs an
 * independent check — a customer can never set it.
 */
import type { Recommendation } from "../tracking/recommendations";

export const TASK_STATUSES = ["suggested", "approved", "in_progress", "implemented", "verified", "dismissed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Actor = "customer" | "operator" | "system";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  suggested: "Suggested",
  approved: "Approved",
  in_progress: "In Progress",
  implemented: "Implemented",
  verified: "Verified",
  dismissed: "Dismissed",
};

export type FixKind =
  | "structured_data"
  | "title_description"
  | "page_outline"
  | "faq"
  | "identity_checklist"
  | "citation"
  | "restore_page"
  | "general";

/** Kinds the website scanner can check; everything else needs an operator check. */
export const SCANNER_VERIFIABLE: ReadonlySet<FixKind> = new Set(["structured_data", "title_description", "page_outline", "faq", "identity_checklist", "restore_page"]);

const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskStatus, readonly Actor[]>>> = {
  suggested: { approved: ["customer", "operator"], dismissed: ["customer", "operator"] },
  approved: { in_progress: ["customer", "operator"], implemented: ["customer", "operator"], dismissed: ["customer", "operator"] },
  in_progress: { implemented: ["customer", "operator"], dismissed: ["customer", "operator"] },
  implemented: { verified: ["system", "operator"], in_progress: ["customer", "operator"] },
  verified: {},
  dismissed: { suggested: ["customer", "operator"] },
};

export type TransitionDecision = { ok: true } | { ok: false; message: string };

export function canTransition(args: { from: TaskStatus; to: TaskStatus; actor: Actor; fixKind: FixKind }): TransitionDecision {
  const allowed = TRANSITIONS[args.from]?.[args.to];
  if (!allowed || !allowed.includes(args.actor)) {
    return { ok: false, message: `Can't move a task from ${STATUS_LABELS[args.from]} to ${STATUS_LABELS[args.to]}.` };
  }
  // Operators may verify only what the scanner can't check; scanner-checkable
  // kinds are verified by the scanner (system) alone.
  if (args.to === "verified" && args.actor === "operator" && SCANNER_VERIFIABLE.has(args.fixKind)) {
    return { ok: false, message: "This change is verified by the website scanner, not manually." };
  }
  return { ok: true };
}

export const isOpen = (s: TaskStatus) => s !== "verified" && s !== "dismissed";
export const openKeyFor = (subscriptionId: string, dedupeKey: string) => `${subscriptionId}:${dedupeKey}`;

export type TaskSeed = {
  dedupeKey: string;
  source: "audit" | "tracking" | "website";
  category: string;
  fixKind: FixKind;
  title: string;
  problem: string;
  evidence: Array<{ text: string; url?: string; observedAt?: string }>;
  url: string | null;
  priority: 1 | 2 | 3;
  priorityReason: string;
  proposedFix: string;
  verificationMethod: "scanner" | "manual";
};

const AUDIT_KIND: Record<string, FixKind> = {
  "schema.no_jsonld": "structured_data",
  "schema.no_localbusiness": "structured_data",
  "schema.missing_required_fields": "structured_data",
  "schema.malformed_fields": "structured_data",
  "schema.no_faqpage": "faq",
  "content.no_faq": "faq",
  "content.thin_content": "page_outline",
  "trust.nap_inconsistent": "identity_checklist",
  "trust.low_surface_agreement": "identity_checklist",
  "brand.unresolved_entity": "identity_checklist",
};

export function fixKindFor(recommendationId: string): FixKind {
  if (recommendationId.startsWith("audit:")) return AUDIT_KIND[recommendationId.slice(6)] ?? "general";
  if (recommendationId === "tracking:not_named") return "identity_checklist";
  if (recommendationId === "tracking:low_mention_rate") return "page_outline";
  if (recommendationId === "tracking:own_site_not_cited") return "faq";
  if (recommendationId === "tracking:citation_gaps" || recommendationId.startsWith("tracking:competitor_leads:")) return "citation";
  if (recommendationId.startsWith("website:lost_local_business_schema:")) return "structured_data";
  if (recommendationId.startsWith("website:page_removed:")) return "restore_page";
  if (recommendationId.startsWith("website:identity_changed:")) return "identity_checklist";
  if (recommendationId.startsWith("website:competitor_topic:")) return "page_outline";
  return "general";
}

const PRIORITY_REASON: Record<1 | 2 | 3, string> = {
  1: "Do first: a missing or broken basic signal AI systems rely on to identify your business.",
  2: "Next: strengthens how clearly AI systems can describe and cite you.",
  3: "Later: an opportunity worth considering once the basics are in place.",
};

/** Build a task seed from a SERVER-recomputed recommendation. */
export function seedFromRecommendation(rec: Recommendation, now: Date): TaskSeed {
  const fixKind = fixKindFor(rec.id);
  return {
    dedupeKey: rec.id,
    source: rec.source,
    category: rec.category,
    fixKind,
    title: rec.title,
    problem: rec.title,
    evidence: [{ text: rec.evidence, ...(rec.url ? { url: rec.url } : {}), observedAt: now.toISOString() }],
    url: rec.url ?? null,
    priority: rec.priority,
    priorityReason: PRIORITY_REASON[rec.priority],
    proposedFix: rec.action,
    verificationMethod: SCANNER_VERIFIABLE.has(fixKind) ? "scanner" : "manual",
  };
}

export type ExistingTaskRef = { id: string; status: TaskStatus; dismissedAt: Date | null; lastSeenAt: Date };

export type CreateDecision =
  | { action: "create"; seed: TaskSeed }
  | { action: "recurrence"; taskId: string; evidence: TaskSeed["evidence"][number] }
  | { action: "skip"; reason: string; taskId: string };

/**
 * One open task per finding. A recurring finding adds evidence to the open
 * task. After verification a recurring finding opens a new task (history
 * kept). A dismissed finding is not re-created unless its evidence is newer
 * than the dismissal.
 */
export function decideCreate(args: { seed: TaskSeed; existing: ExistingTaskRef[]; evidenceObservedAt: Date }): CreateDecision {
  const open = args.existing.find((t) => isOpen(t.status));
  if (open) return { action: "recurrence", taskId: open.id, evidence: args.seed.evidence[0]! };
  const dismissed = args.existing
    .filter((t) => t.status === "dismissed" && t.dismissedAt)
    .sort((a, b) => b.dismissedAt!.getTime() - a.dismissedAt!.getTime())[0];
  const latestVerified = args.existing.filter((t) => t.status === "verified").sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())[0];
  if (dismissed && (!latestVerified || dismissed.dismissedAt! > latestVerified.lastSeenAt) && args.evidenceObservedAt <= dismissed.dismissedAt!) {
    return { action: "skip", reason: "You dismissed this finding; it hasn't been observed again since.", taskId: dismissed.id };
  }
  return { action: "create", seed: args.seed };
}
