/**
 * GeoViz — AI Answer Sampling module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. See README.md in this directory for full scaffold docs.
 *
 * Hard rule (mirrors src/lib/v2/contracts.ts): do NOT add runtime
 * functions to this file. Implementation lives in sibling files that
 * implement these interfaces once the module is greenlit.
 */

import type { Timestamp, VisibilityScore } from "@/lib/v2/contracts";

/** The set of AI platforms GeoViz samples against. Extend, never rename existing members. */
export type SampledPlatform =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "google_ai_overview";

/** One buyer-intent query sampled for a business/category/geo. */
export interface SamplingQuery {
  hostname: string;
  category: string;
  geo: string;
  /** The literal prompt text sent to the platform. */
  queryText: string;
}

/** A single verbatim sampled answer, stored immutably. */
export interface AnswerSnapshot {
  id: string;
  hostname: string;
  platform: SampledPlatform;
  query: SamplingQuery;
  /** Verbatim answer text — never summarized or truncated at storage time. */
  answerText: string;
  /** Whether the business was mentioned/cited at all. */
  mentioned: boolean;
  /** Position within the answer if mentioned (1 = first), else null. */
  position: number | null;
  /** Source URLs the platform cited, in order, where the platform exposes this. */
  citedSources: string[] | null;
  modelVersion: string | null;
  capturedAt: Timestamp;
}

/** Aggregated view of sampling volatility for a business/category/geo over a window. */
export interface AnswerVolatility {
  hostname: string;
  category: string;
  geo: string;
  windowDays: number;
  /** Fraction of samples in the window where the business was mentioned. */
  mentionRate: number;
  /** Stability label — how much mentionRate has moved within the window. */
  stability: "stable" | "volatile" | "insufficient_data";
}

export interface AnswerSamplingService {
  /** Run one sampling pass for a given query set; returns the new snapshots. */
  sample(queries: SamplingQuery[]): Promise<AnswerSnapshot[]>;

  /** Load the stored snapshot history for a hostname within a window. */
  history(args: {
    hostname: string;
    windowDays: number;
  }): Promise<AnswerSnapshot[]>;

  /** Compute volatility over the stored history. */
  volatility(args: {
    hostname: string;
    category: string;
    geo: string;
    windowDays: number;
  }): Promise<AnswerVolatility>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma. Lives
 * here as a reference for when this module is greenlit. Mirrors the
 * ObservationHistory append-only pattern in the live schema exactly.
 *
 * /// Append-only store of verbatim AI-answer samples. One row per
 * /// sampled query per platform per run. NEVER updated, NEVER
 * /// overwritten — to revise, insert a new row. This is the
 * /// ground-truth evidence layer referenced throughout
 * /// docs/strategy/03_DATA_MOAT.md.
 * model AiAnswerSnapshot {
 *   id            String   @id @default(cuid())
 *   hostname      String
 *   platform      String   // SampledPlatform, see contracts.ts
 *   category      String
 *   geo           String
 *   queryText     String
 *   answerText    String   @db.Text
 *   mentioned     Boolean
 *   position      Int?
 *   citedSources  Json?    // string[] | null — Shape: AnswerSnapshot["citedSources"]
 *   modelVersion  String?
 *   capturedAt    DateTime @default(now())
 *
 *   @@index([hostname])
 *   @@index([capturedAt])
 *   @@index([hostname, category, geo])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
