/**
 * GeoViz — Change Detection module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. Hard rule: every comparator implementing these
 * interfaces must be deterministic — no LLM calls in this module,
 * ever (see README.md "Purpose").
 */

import type { Timestamp } from "@/lib/v2/contracts";
import type { LayerContextBlock } from "@/modules/visibility-layer/contracts";
import type { AnswerSnapshot } from "@/modules/ai-answer-sampling/contracts";

export type ChangeCategory =
  | "entity_schema_drift"
  | "citation_change"
  | "competitor_score_shift"
  | "technical_regression";

export interface ChangeEvent {
  id: string;
  hostname: string;
  category: ChangeCategory;
  /** Deterministic, human-readable description of exactly what differed. */
  description: string;
  /** The two compared states, opaque here — comparator-specific shape. */
  before: unknown;
  after: unknown;
  detectedAt: Timestamp;
}

export interface ChangeDetectionService {
  /** Deterministic field-by-field comparison of two entity/schema snapshots. */
  compareEntitySchema(args: {
    before: LayerContextBlock;
    after: LayerContextBlock;
  }): Promise<ChangeEvent | null>;

  /** Deterministic comparison of two citation/answer snapshots for the same query. */
  compareCitation(args: {
    before: AnswerSnapshot;
    after: AnswerSnapshot;
  }): Promise<ChangeEvent | null>;

  history(hostname: string, sinceDays: number): Promise<ChangeEvent[]>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// Append-only log of detected changes. NEVER updated, NEVER
 * /// overwritten — one row per detection, whether or not a change
 * /// was found is implied by presence of a row (only positive
 * /// detections are persisted).
 * model ChangeEvent {
 *   id          String   @id @default(cuid())
 *   hostname    String
 *   category    String   // ChangeCategory, see contracts.ts
 *   description String
 *   before      Json
 *   after       Json
 *   detectedAt  DateTime @default(now())
 *
 *   @@index([hostname])
 *   @@index([category])
 *   @@index([detectedAt])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
