/**
 * GeoViz — Competitor Intelligence module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. Implements the CompetitorTracker/CompetitorComparison
 * shapes already declared in src/lib/v2/contracts.ts rather than
 * redefining them.
 */

import type {
  CompetitorComparison,
  CompetitorTracker,
  VisibilitySnapshot,
} from "@/lib/v2/contracts";
import type { AnswerSnapshot } from "@/modules/ai-answer-sampling/contracts";

export interface CompetitorSet {
  hostname: string;
  competitorHostnames: string[];
  autoDetected: boolean;
}

/** Category share-of-citation across a defined competitor set. */
export interface ShareOfCitation {
  category: string;
  geo: string;
  /** hostname -> fraction of sampled answers citing that business. */
  shareByHostname: Record<string, number>;
  windowDays: number;
}

export interface CrossPlatformDivergence {
  hostname: string;
  /** platform -> whether the business was mentioned, per src/modules/ai-answer-sampling SampledPlatform. */
  mentionedByPlatform: Record<string, boolean>;
}

export interface CompetitorIntelligenceService extends CompetitorTracker {
  defineSet(args: {
    hostname: string;
    competitorHostnames: string[];
  }): Promise<CompetitorSet>;

  shareOfCitation(set: CompetitorSet, windowDays: number): Promise<ShareOfCitation>;

  divergence(hostname: string, recentSnapshots: AnswerSnapshot[]): Promise<CrossPlatformDivergence>;

  // Inherited from CompetitorTracker (src/lib/v2/contracts.ts):
  // compare(args): Promise<CompetitorComparison>
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// One row per customer-defined (or auto-detected) competitor set.
 * model CompetitorSet {
 *   id                  String   @id @default(cuid())
 *   hostname            String
 *   competitorHostnames Json     // string[] — Shape: CompetitorSet["competitorHostnames"]
 *   autoDetected        Boolean  @default(false)
 *   createdAt           DateTime @default(now())
 *
 *   @@index([hostname])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
