/**
 * GeoViz — Cohort Analysis module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. Implements the `BenchmarkStore` shape already declared
 * in src/lib/v2/contracts.ts rather than redefining it.
 */

import type {
  BenchmarkCohort,
  VisibilitySnapshot,
} from "@/lib/v2/contracts";

/** Granularity a cohort can be sliced by. */
export type CohortDimension = "industry" | "geo" | "business_size";

export interface CohortRecomputation {
  label: string;
  dimension: CohortDimension;
  methodologyVersion: string;
  sampleSize: number;
  computedAt: number;
}

export interface CohortAnalysisService {
  /** Implements src/lib/v2/contracts.ts BenchmarkStore.cohortsFor. */
  cohortsFor(snapshot: VisibilitySnapshot): Promise<BenchmarkCohort[]>;

  /** Trigger a scheduled recomputation for a given dimension; returns the new version. */
  recompute(dimension: CohortDimension): Promise<CohortRecomputation>;

  /** Load recomputation history for audit/versioning purposes. */
  recomputationHistory(dimension: CohortDimension): Promise<CohortRecomputation[]>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// Versioned cohort snapshots. Each recomputation inserts a new
 * /// row rather than updating a prior one — historical published
 * /// benchmark numbers must remain traceable to the exact snapshot
 * /// that produced them (see docs/strategy/06_BENCHMARK_ENGINE.md
 * /// "Versioning").
 * model CohortSnapshot {
 *   id                 String   @id @default(cuid())
 *   label              String
 *   dimension          String   // CohortDimension, see contracts.ts
 *   methodologyVersion String
 *   sampleSize         Int
 *   medianOverall      Int
 *   byCategory         Json     // Record<string, number> — Shape: BenchmarkCohort["byCategory"]
 *   computedAt         DateTime @default(now())
 *
 *   @@index([dimension])
 *   @@index([label])
 *   @@index([computedAt])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
