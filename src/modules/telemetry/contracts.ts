/**
 * GeoViz — Telemetry module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. See README.md in this directory for full scaffold docs.
 *
 * Every other src/modules/* directory that needs to emit an event
 * should depend on this file's types, never the other way around.
 */

import type { Timestamp } from "@/lib/v2/contracts";

/** The closed set of modules allowed to emit telemetry. Extend as new modules are greenlit. */
export type TelemetrySource =
  | "visibility-layer"
  | "wordpress-plugin"
  | "shopify-plugin"
  | "monitoring"
  | "agency-platform"
  | "enterprise";

/** A single generic telemetry event. */
export interface TelemetryEvent {
  id: string;
  source: TelemetrySource;
  /** Free-text but documented per source — see the emitting module's contracts.ts. */
  eventType: string;
  hostname: string | null;
  /** Structured, source-specific payload. Shape documented at the emission site, not here. */
  payload: Record<string, unknown>;
  capturedAt: Timestamp;
}

export interface TelemetryService {
  emit(event: Omit<TelemetryEvent, "id" | "capturedAt">): Promise<{ id: string }>;

  query(args: {
    source?: TelemetrySource;
    eventType?: string;
    hostname?: string;
    sinceDays?: number;
  }): Promise<TelemetryEvent[]>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// Append-only, generic event log for every src/modules/* emitter.
 * /// NEVER updated, NEVER overwritten. Kept deliberately generic
 * /// (source + eventType + Json payload) so adding a new emitting
 * /// module never requires a schema migration.
 * model TelemetryEvent {
 *   id         String   @id @default(cuid())
 *   source     String   // TelemetrySource, see contracts.ts
 *   eventType  String
 *   hostname   String?
 *   payload    Json     // Shape: source+eventType specific, documented at emission site
 *   capturedAt DateTime @default(now())
 *
 *   @@index([source])
 *   @@index([hostname])
 *   @@index([capturedAt])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
