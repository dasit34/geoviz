/**
 * GeoViz — Visibility Layer module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today.
 */

import type { Timestamp } from "@/lib/v2/contracts";

export type SupportedCms =
  | "wordpress"
  | "shopify"
  | "webflow"
  | "wix"
  | "squarespace"
  | "custom";

/** The machine-readable context block served by the snippet. */
export interface LayerContextBlock {
  hostname: string;
  businessName: string;
  services: string[];
  serviceArea: string[];
  hours: string | null;
  trustSignals: string[];
  /** The schema-version this block was generated against — ties back to schemaValidation.ts's taxonomy. */
  schemaVersion: string;
}

export interface LayerInstallRecord {
  id: string;
  hostname: string;
  cms: SupportedCms;
  installedAt: Timestamp;
  lastLivenessCheckAt: Timestamp | null;
  isLive: boolean;
}

export interface VisibilityLayerService {
  /** Register a new install and generate its initial context block. */
  install(args: { hostname: string; cms: SupportedCms }): Promise<LayerInstallRecord>;

  /** Regenerate the context block from the latest source-of-truth business data. */
  refreshContextBlock(hostname: string): Promise<LayerContextBlock>;

  /** Record a liveness ping from the deployed snippet. */
  recordLiveness(hostname: string): Promise<void>;

  /** Compare the currently-served block against the source of truth; returns true if drifted. */
  hasDrifted(hostname: string): Promise<boolean>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// One row per Layer install. Updated in place (not append-only —
 * /// this is live install state, not historical evidence). Liveness
 * /// history itself belongs in the telemetry module's TelemetryEvent
 * /// table, not here.
 * model LayerInstall {
 *   id                   String    @id @default(cuid())
 *   hostname             String    @unique
 *   cms                  String    // SupportedCms, see contracts.ts
 *   installedAt          DateTime  @default(now())
 *   lastLivenessCheckAt  DateTime?
 *   isLive               Boolean   @default(true)
 *   contextBlockVersion  String
 *
 *   @@index([hostname])
 *   @@index([cms])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
