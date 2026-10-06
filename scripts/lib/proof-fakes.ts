/**
 * In-memory Proof Engine stores for DB-free tests. Enforce the same
 * subscription scoping and conditional lifecycle writes as the Prisma store.
 */
import type { CycleSnapshot, ProofResult } from "../../src/lib/monitoring/proof/compare";
import type { RunRow } from "../../src/lib/monitoring/proof/evidence";
import { canRecordAssessment, type ExperimentRecord, type ExperimentStore, type TaskForExperiment } from "../../src/lib/monitoring/proof/experiment";
import { planActivationSync, toItemRows, type QuestionSetRecord, type QuestionSetStore } from "../../src/lib/monitoring/proof/question-set";
import type { ProofDataSource, ProofStores } from "../../src/lib/monitoring/proof/types";
import type { WebsiteEvidence } from "../../src/lib/monitoring/proof/view";

export type FakePrompt = { id: string; subscriptionId: string; text: string; normalizedText: string; isActive: boolean };

export function makeProofFakes() {
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;
  const sets: QuestionSetRecord[] = [];
  const prompts: FakePrompt[] = [];
  const experiments: ExperimentRecord[] = [];
  const tasks: TaskForExperiment[] = [];
  const verifications = new Map<string, NonNullable<WebsiteEvidence["verification"]>>();
  const cycles: Array<CycleSnapshot & { subscriptionId: string }> = [];
  const runRows = new Map<string, RunRow[]>();
  const clone = <T>(x: T): T => structuredClone(x);

  const questionSets: QuestionSetStore = {
    async listSets(sub) { return clone(sets.filter((s) => s.subscriptionId === sub).sort((a, b) => b.version - a.version)); },
    async getSet(sub, setId) { const s = sets.find((x) => x.id === setId && x.subscriptionId === sub); return s ? clone(s) : null; },
    async activeSet(sub) { const s = sets.find((x) => x.subscriptionId === sub && x.status === "active"); return s ? clone(s) : null; },
    async createDraft(sub, ctx, items, now) {
      const version = Math.max(0, ...sets.filter((s) => s.subscriptionId === sub).map((s) => s.version)) + 1;
      const set: QuestionSetRecord = {
        id: id("qs"), subscriptionId: sub, version, status: "draft", ...ctx, createdAt: now,
        approvedAt: null, approvedBy: null, activatedAt: null, firstMeasuredAt: null, retiredAt: null,
        items: toItemRows(items).map((i) => ({ id: id("qi"), position: i.position, text: i.text, normalizedText: i.normalizedText, intent: i.intent, rationale: i.rationale, trackedPromptId: null })),
      };
      sets.push(set);
      return clone(set);
    },
    async replaceDraftItems(sub, setId, items) {
      const s = sets.find((x) => x.id === setId && x.subscriptionId === sub && x.status === "draft" && x.firstMeasuredAt === null);
      if (!s) return false;
      s.items = toItemRows(items).map((i) => ({ id: id("qi"), position: i.position, text: i.text, normalizedText: i.normalizedText, intent: i.intent, rationale: i.rationale, trackedPromptId: null }));
      return true;
    },
    async approve(sub, setId, by, now) {
      const s = sets.find((x) => x.id === setId && x.subscriptionId === sub && x.status === "draft");
      if (!s) return false;
      Object.assign(s, { status: "approved", approvedAt: now, approvedBy: by });
      return true;
    },
    async activate(sub, setId, now) {
      const s = sets.find((x) => x.id === setId && x.subscriptionId === sub && x.status === "approved");
      if (!s) return false;
      for (const other of sets) if (other.subscriptionId === sub && other.status === "active") Object.assign(other, { status: "retired", retiredAt: now });
      const mine = prompts.filter((p) => p.subscriptionId === sub);
      const sync = planActivationSync(s.items, mine);
      for (const pid of sync.deactivate) mine.find((p) => p.id === pid)!.isActive = false;
      const link = new Map<string, string>();
      for (const l of sync.link) { mine.find((p) => p.id === l.trackedPromptId)!.isActive = true; link.set(l.itemNormalizedText, l.trackedPromptId); }
      for (const c of sync.create) { const p = { id: id("tp"), subscriptionId: sub, text: c.text, normalizedText: c.normalizedText, isActive: true }; prompts.push(p); link.set(c.normalizedText, p.id); }
      for (const i of s.items) i.trackedPromptId = link.get(i.normalizedText) ?? null;
      Object.assign(s, { status: "active", activatedAt: now });
      return true;
    },
    async markFirstMeasured(sub, setId, now) {
      const s = sets.find((x) => x.id === setId && x.subscriptionId === sub);
      if (s && s.firstMeasuredAt === null) s.firstMeasuredAt = now;
    },
  };

  const experimentStore: ExperimentStore = {
    async list(sub) { return clone(experiments.filter((e) => e.subscriptionId === sub)); },
    async get(sub, eid) { const e = experiments.find((x) => x.id === eid && x.subscriptionId === sub); return e ? clone(e) : null; },
    async findByTask(sub, tid) { const e = experiments.find((x) => x.improvementTaskId === tid && x.subscriptionId === sub); return e ? clone(e) : null; },
    async create(data, now) {
      const e: ExperimentRecord = { ...data, id: id("exp"), createdAt: now, followUpCycleId: null, outcome: null, outcomeReason: null, outcomeVersion: null, assessment: null, assessedAt: null };
      experiments.push(e);
      return clone(e);
    },
    async recordAssessment(sub, eid, a, now) {
      const e = experiments.find((x) => x.id === eid && x.subscriptionId === sub);
      if (!e || !canRecordAssessment(e.outcome)) return false;
      Object.assign(e, { outcome: a.outcome, outcomeReason: a.reason, outcomeVersion: a.outcomeVersion, followUpCycleId: a.followUpCycleId, assessment: clone(a), assessedAt: now });
      return true;
    },
  };

  const done = (c: CycleSnapshot) => c.status === "completed" || c.status === "partial";
  const strip = ({ subscriptionId: _s, ...c }: CycleSnapshot & { subscriptionId: string }): CycleSnapshot => clone(c);
  const data: ProofDataSource = {
    async getTask(sub, tid) { const t = tasks.find((x) => x.id === tid && x.subscriptionId === sub); return t ? clone(t) : null; },
    async listTasks(sub) { return tasks.filter((t) => t.subscriptionId === sub).map((t) => ({ id: t.id, title: t.title, status: t.status })); },
    async latestVerification(sub, tid) {
      const t = tasks.find((x) => x.id === tid && x.subscriptionId === sub);
      return t ? clone(verifications.get(tid) ?? null) : null;
    },
    async cycleSnapshot(sub, cid) { const c = cycles.find((x) => x.id === cid && x.subscriptionId === sub); return c ? strip(c) : null; },
    async latestCycleForSet(sub, setId, version, before) {
      const c = cycles.filter((x) => x.subscriptionId === sub && x.questionSetId === setId && x.questionSetVersion === version && done(x) && (!before || x.startedAt < before))
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
      return c ? strip(c) : null;
    },
    async firstCycleForSetAfter(sub, setId, version, after) {
      const c = cycles.filter((x) => x.subscriptionId === sub && x.questionSetId === setId && x.questionSetVersion === version && done(x) && x.startedAt > after)
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];
      return c ? strip(c) : null;
    },
    async latestCycles(sub, limit) {
      return cycles.filter((x) => x.subscriptionId === sub && done(x)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit).map(strip);
    },
    async runRows(sub, cid) {
      const c = cycles.find((x) => x.id === cid && x.subscriptionId === sub);
      return c ? clone(runRows.get(cid) ?? []) : [];
    },
    async promptTexts(sub) { return prompts.filter((p) => p.subscriptionId === sub).map((p) => ({ id: p.id, text: p.text })); },
    async competitorNames() { return { comp_a: "Acme Rivals" }; },
    async auditScores() { return { baseline: null, followUp: null }; },
    async websiteChanges() { return []; },
  };

  const stores: ProofStores = { questionSets, experiments: experimentStore, data };
  return {
    stores, sets, prompts, experiments, tasks, verifications, cycles, runRows,
    addTask(t: Partial<TaskForExperiment> & { id: string; subscriptionId: string }) {
      const task: TaskForExperiment = {
        status: "approved", title: "Add WebSite and SoftwareApplication schema", proposedFix: "Add JSON-LD to the homepage.", url: "https://example.com/",
        implementationUrl: null, category: "structured_data", dedupeKey: "audit:schema", evidence: [{ text: "No SoftwareApplication schema." }],
        approvedAt: new Date("2026-10-01T00:00:00Z"), implementedAt: null, verifiedAt: null, ...t,
      };
      tasks.push(task);
      return task;
    },
    addCycle(c: Partial<CycleSnapshot> & { id: string; subscriptionId: string; startedAt: Date; results: ProofResult[] }) {
      const cycle = { status: "completed", questionSetId: null, questionSetVersion: null, providers: ["openai", "claude"], samplesPerPrompt: 2, competitors: [], ...c };
      cycles.push(cycle as CycleSnapshot & { subscriptionId: string });
      return cycle;
    },
  };
}

/** Measured results for every (prompt × provider × sample): `mentionedEvery` = mention 1 in N samples (0 = never). */
export function results(promptIds: string[], providers: string[], samples: number, opts: { mentionedCount: number; fingerprint?: string; nativeDomains?: string[]; competitorIds?: string[]; failEvery?: number }): ProofResult[] {
  const out: ProofResult[] = [];
  let i = 0;
  for (const p of promptIds) for (const prov of providers) for (let s = 0; s < samples; s += 1) {
    const failed = opts.failEvery ? i % opts.failEvery === opts.failEvery - 1 : false;
    out.push({
      trackedPromptId: p, provider: prov, sampleIndex: s, status: failed ? "not_measured" : "measured", callState: failed ? "failed" : "completed",
      mentioned: failed ? null : i < opts.mentionedCount, position: null, positionStatus: failed ? "not_measured" : "no_ordered_list",
      configFingerprint: failed ? null : `${opts.fingerprint ?? "fp"}::${prov}`, citedDomains: [], namedBusinesses: [],
      competitorIdsMentioned: failed ? [] : opts.competitorIds ?? [], costUsd: null, nativeCitationDomains: failed ? [] : opts.nativeDomains ?? [],
    });
    i += 1;
  }
  return out;
}
