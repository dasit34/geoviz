/**
 * Proof Engine v1 — read access the service needs, behind an interface so
 * the whole workflow is testable with an in-memory fake. EVERY method takes
 * the subscriptionId and must return nothing for rows of another
 * subscription (tenant isolation is enforced at this boundary).
 */
import type { CycleSnapshot } from "./compare";
import type { TaskForExperiment } from "./experiment";
import type { ExperimentStore } from "./experiment";
import type { QuestionSetStore } from "./question-set";
import type { RunRow } from "./evidence";
import type { ScorePoint, WebsiteEvidence } from "./view";

export interface ProofDataSource {
  getTask(subscriptionId: string, taskId: string): Promise<TaskForExperiment | null>;
  listTasks(subscriptionId: string): Promise<Array<{ id: string; title: string; status: string }>>;
  latestVerification(subscriptionId: string, taskId: string): Promise<WebsiteEvidence["verification"]>;
  cycleSnapshot(subscriptionId: string, cycleId: string): Promise<CycleSnapshot | null>;
  /** Most recent completed/partial cycle measured against this set version, optionally started before `before`. */
  latestCycleForSet(subscriptionId: string, setId: string, version: number, before?: Date): Promise<CycleSnapshot | null>;
  /** First completed/partial cycle against this set version that started after `after`. */
  firstCycleForSetAfter(subscriptionId: string, setId: string, version: number, after: Date): Promise<CycleSnapshot | null>;
  /** The two most recent completed/partial cycles (newest first). */
  latestCycles(subscriptionId: string, limit: number): Promise<CycleSnapshot[]>;
  runRows(subscriptionId: string, cycleId: string): Promise<RunRow[]>;
  promptTexts(subscriptionId: string): Promise<Array<{ id: string; text: string }>>;
  competitorNames(subscriptionId: string): Promise<Record<string, string>>;
  auditScores(subscriptionId: string, around: Date): Promise<{ baseline: ScorePoint; followUp: ScorePoint }>;
  websiteChanges(subscriptionId: string, from: Date, to: Date): Promise<WebsiteEvidence["changes"]>;
}

export type ProofStores = {
  questionSets: QuestionSetStore;
  experiments: ExperimentStore;
  data: ProofDataSource;
};
