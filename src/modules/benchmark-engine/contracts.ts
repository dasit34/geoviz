/**
 * GeoViz — Benchmark Engine module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today.
 */

import type { BenchmarkCohort } from "@/lib/v2/contracts";
import type { AnswerVolatility } from "@/modules/ai-answer-sampling/contracts";

export type BenchmarkScope = "industry" | "city" | "state" | "national";

export interface PublishedBenchmark {
  id: string;
  scope: BenchmarkScope;
  label: string;
  methodologyVersion: string;
  sampleSize: number;
  cohort: BenchmarkCohort;
  volatility: AnswerVolatility | null;
  publishedAt: number;
}

export interface BenchmarkEngineService {
  /** Publish a new benchmark snapshot. Refuses if sampleSize is below the configured floor. */
  publish(args: {
    scope: BenchmarkScope;
    label: string;
    cohort: BenchmarkCohort;
  }): Promise<PublishedBenchmark>;

  /** All published benchmarks for a scope, most recent first. Never mutates history. */
  history(scope: BenchmarkScope, label: string): Promise<PublishedBenchmark[]>;

  /** Top/bottom performer selection — must return aggregate-safe data only. */
  topPerformers(args: { scope: BenchmarkScope; label: string; n: number }): Promise<
    Array<{ hostnameHash: string; score: number }>
  >;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// Append-only, versioned published benchmarks. NEVER updated,
 * /// NEVER overwritten — restating a historical number requires a
 * /// new row with an explicit "restated under vX.X" note in
 * /// methodologyVersion, per docs/strategy/06_BENCHMARK_ENGINE.md.
 * model PublishedBenchmark {
 *   id                 String   @id @default(cuid())
 *   scope              String   // BenchmarkScope, see contracts.ts
 *   label              String
 *   methodologyVersion String
 *   sampleSize         Int
 *   cohort             Json     // Shape: BenchmarkCohort from src/lib/v2/contracts.ts
 *   volatility         Json?    // Shape: AnswerVolatility from ai-answer-sampling/contracts.ts
 *   publishedAt        DateTime @default(now())
 *
 *   @@index([scope, label])
 *   @@index([publishedAt])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
