/**
 * Proof Engine v1 — workflow orchestration over the stores (injectable, so
 * the whole workflow runs against an in-memory fake in tests).
 *
 * Every function takes the subscription it acts for; nothing reads or writes
 * across subscriptions (the stores enforce the same scoping).
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";
import { assessExperiment, decideCreateExperiment, type Assessment, type ExperimentRecord } from "./experiment";
import { buildRunEvidence, type RunEvidence } from "./evidence";
import { buildOwnerSummary, type OwnerSummary } from "./owner-summary";
import {
  cloneItems,
  decideActivate,
  decideApprove,
  decideEditItems,
  proposeQuestionSet,
  QUESTION_SET_GENERATOR_VERSION,
  type NewItem,
  type QuestionSetContext,
  type QuestionSetRecord,
} from "./question-set";
import type { ProofStores } from "./types";
import { buildProofView, type ProofView } from "./view";

export type Sub = { id: string; websiteUrl: string; businessName: string | null };
export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = <T>(reason: string): Result<T> => ({ ok: false, reason });

export async function proposeDraft(stores: ProofStores, sub: Sub, ctx: QuestionSetContext, now: Date): Promise<Result<QuestionSetRecord>> {
  const items = proposeQuestionSet(ctx);
  if (items.length === 0) return fail("Couldn't propose questions — a business name and category are required.");
  const set = await stores.questionSets.createDraft(sub.id, {
    businessCategory: ctx.businessCategory || null,
    city: ctx.city ?? null,
    state: ctx.state ?? null,
    serviceArea: ctx.serviceArea ?? null,
    generatorVersion: QUESTION_SET_GENERATOR_VERSION,
    notes: null,
  }, items.map((i) => ({ text: i.text, intent: i.intent, rationale: i.rationale })), now);
  return { ok: true, value: set };
}

export async function editDraft(stores: ProofStores, sub: Sub, setId: string, items: NewItem[]): Promise<Result<true>> {
  const set = await stores.questionSets.getSet(sub.id, setId);
  if (!set) return fail("Question set not found.");
  const d = decideEditItems(set, items);
  if (!d.ok) return fail(d.reason);
  return (await stores.questionSets.replaceDraftItems(sub.id, setId, items)) ? { ok: true, value: true } : fail("The set changed — reload and try again.");
}

export async function approveSet(stores: ProofStores, sub: Sub, setId: string, by: string, now: Date): Promise<Result<true>> {
  const set = await stores.questionSets.getSet(sub.id, setId);
  if (!set) return fail("Question set not found.");
  const d = decideApprove(set);
  if (!d.ok) return fail(d.reason);
  return (await stores.questionSets.approve(sub.id, setId, by, now)) ? { ok: true, value: true } : fail("The set changed — reload and try again.");
}

export async function activateSet(stores: ProofStores, sub: Sub, setId: string, now: Date): Promise<Result<true>> {
  const set = await stores.questionSets.getSet(sub.id, setId);
  if (!set) return fail("Question set not found.");
  const d = decideActivate(set);
  if (!d.ok) return fail(d.reason);
  return (await stores.questionSets.activate(sub.id, setId, now)) ? { ok: true, value: true } : fail("The set changed — reload and try again.");
}

/** A new draft version (n+1) copying an existing set's wording — the only way to change approved questions. */
export async function newVersionFrom(stores: ProofStores, sub: Sub, setId: string, now: Date): Promise<Result<QuestionSetRecord>> {
  const set = await stores.questionSets.getSet(sub.id, setId);
  if (!set) return fail("Question set not found.");
  const draft = await stores.questionSets.createDraft(sub.id, {
    businessCategory: set.businessCategory, city: set.city, state: set.state, serviceArea: set.serviceArea,
    generatorVersion: set.generatorVersion, notes: `Copied from version ${set.version}.`,
  }, cloneItems(set), now);
  return { ok: true, value: draft };
}

export async function createExperiment(
  stores: ProofStores,
  sub: Sub,
  args: { taskId: string; expectedCategory: string; isFixture?: boolean },
  now: Date,
): Promise<Result<ExperimentRecord>> {
  const task = await stores.data.getTask(sub.id, args.taskId);
  if (!task) return fail("Improvement task not found.");
  const active = await stores.questionSets.activeSet(sub.id);
  const baseline = active ? await stores.data.latestCycleForSet(sub.id, active.id, active.version, task.implementedAt ?? undefined) : null;
  const existing = await stores.experiments.findByTask(sub.id, task.id);
  const d = decideCreateExperiment({ task, activeSet: active, baselineCycle: baseline, alreadyExists: existing !== null });
  if (!d.ok) return fail(d.reason);
  const exp = await stores.experiments.create({
    subscriptionId: sub.id,
    improvementTaskId: task.id,
    questionSetId: active!.id,
    questionSetVersion: active!.version,
    baselineCycleId: baseline!.id,
    findingId: task.dedupeKey,
    findingEvidence: task.evidence,
    expectedCategory: args.expectedCategory.trim() || task.category,
    isFixture: args.isFixture === true,
  }, now);
  return { ok: true, value: exp };
}

async function assessmentFor(stores: ProofStores, sub: Sub, exp: ExperimentRecord): Promise<Result<{ assessment: Assessment }>> {
  const task = await stores.data.getTask(sub.id, exp.improvementTaskId);
  if (!task) return fail("Improvement task not found.");
  const baseline = await stores.data.cycleSnapshot(sub.id, exp.baselineCycleId);
  if (!baseline) return fail("Baseline measurement not found.");
  const followUp = task.implementedAt
    ? await stores.data.firstCycleForSetAfter(sub.id, exp.questionSetId, exp.questionSetVersion, task.implementedAt)
    : null;
  const verification = await stores.data.latestVerification(sub.id, task.id);
  const assessment = assessExperiment({ task, verificationOutcome: verification?.outcome ?? null, baseline, followUp, customerDomain: normalizeDomain(sub.websiteUrl) });
  return { ok: true, value: { assessment } };
}

/** Assess and record. Final outcomes are frozen; non-final ones can be re-assessed later. */
export async function assessAndRecord(stores: ProofStores, sub: Sub, experimentId: string, now: Date): Promise<Result<Assessment>> {
  const exp = await stores.experiments.get(sub.id, experimentId);
  if (!exp) return fail("Experiment not found.");
  const r = await assessmentFor(stores, sub, exp);
  if (!r.ok) return r;
  const wrote = await stores.experiments.recordAssessment(sub.id, exp.id, r.value.assessment, now);
  if (!wrote) return fail("This experiment already has a final outcome, so it can't be re-assessed.");
  return { ok: true, value: r.value.assessment };
}

export type ProofDashboard = {
  questionSets: QuestionSetRecord[];
  activeSet: QuestionSetRecord | null;
  experiments: ProofView[];
  latestEvidence: RunEvidence[];
  summary: OwnerSummary;
};

export async function loadProofDashboard(
  stores: ProofStores,
  sub: Sub,
  opts: { now: Date; recommendations: Array<{ title: string; action: string }> },
): Promise<ProofDashboard> {
  const [questionSets, activeSet, experiments, tasks, competitorNames, prompts, cycles] = await Promise.all([
    stores.questionSets.listSets(sub.id),
    stores.questionSets.activeSet(sub.id),
    stores.experiments.list(sub.id),
    stores.data.listTasks(sub.id),
    stores.data.competitorNames(sub.id),
    stores.data.promptTexts(sub.id),
    stores.data.latestCycles(sub.id, 2),
  ]);
  const customerDomain = normalizeDomain(sub.websiteUrl);
  const intentByPrompt = new Map((activeSet?.items ?? []).filter((i) => i.trackedPromptId).map((i) => [i.trackedPromptId!, i.intent]));
  const textById = new Map(prompts.map((p) => [p.id, p.text]));

  const views: ProofView[] = [];
  for (const exp of experiments) {
    const task = await stores.data.getTask(sub.id, exp.improvementTaskId);
    const baseline = await stores.data.cycleSnapshot(sub.id, exp.baselineCycleId);
    if (!task || !baseline) continue;
    const followUp = exp.followUpCycleId
      ? await stores.data.cycleSnapshot(sub.id, exp.followUpCycleId)
      : task.implementedAt ? await stores.data.firstCycleForSetAfter(sub.id, exp.questionSetId, exp.questionSetVersion, task.implementedAt) : null;
    const verification = await stores.data.latestVerification(sub.id, task.id);
    const around = task.implementedAt ?? opts.now;
    views.push(buildProofView({
      experiment: exp,
      task,
      verificationOutcome: verification?.outcome ?? null,
      baseline,
      followUp,
      customerDomain,
      auditScores: await stores.data.auditScores(sub.id, around),
      website: { verification, changes: await stores.data.websiteChanges(sub.id, baseline.startedAt, followUp?.startedAt ?? opts.now) },
    }));
  }

  const [current, previous] = cycles;
  const runRows = current ? await stores.data.runRows(sub.id, current.id) : [];
  const terms = [sub.businessName ?? "", customerDomain ?? ""].filter(Boolean);
  const latestEvidence = runRows.map((row) => buildRunEvidence(row, textById.get(row.trackedPromptId) ?? "(question not found)", { businessTerms: terms, competitorNames }));

  const summary = buildOwnerSummary({
    businessName: sub.businessName ?? customerDomain ?? sub.websiteUrl,
    customerDomain,
    period: { from: previous?.startedAt ?? current?.startedAt ?? opts.now, to: current?.startedAt ?? opts.now },
    current: current ?? null,
    previous: previous ?? null,
    questions: prompts.map((p) => ({ trackedPromptId: p.id, text: p.text, intent: intentByPrompt.get(p.id) ?? null })),
    competitorNames,
    recommendations: opts.recommendations,
    tasks,
    experiments: experiments.map((e) => ({ improvementTaskId: e.improvementTaskId, outcome: e.outcome })),
  });

  return { questionSets, activeSet, experiments: views, latestEvidence, summary };
}
