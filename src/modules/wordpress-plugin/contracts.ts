/**
 * GeoViz — WordPress Plugin module contracts.
 *
 * Type-only seam describing the GeoViz-side API contract a future
 * PHP WordPress plugin would call. No runtime code, not imported by
 * V1 today. The plugin itself is out of scope for this repo.
 */

import type { LayerInstallRecord } from "@/modules/visibility-layer/contracts";

export interface WordPressPluginConfig {
  hostname: string;
  pluginVersion: string;
  wpVersion: string;
  autoSyncEnabled: boolean;
}

export interface WordPressPluginService {
  /** Called on plugin activation; delegates to VisibilityLayerService.install under the hood. */
  activate(args: {
    hostname: string;
    pluginVersion: string;
    wpVersion: string;
  }): Promise<LayerInstallRecord>;

  /** Called when the wp-admin user clicks "Sync now." */
  syncNow(hostname: string): Promise<{ synced: boolean; syncedAt: number }>;

  /** Called on plugin deactivation. */
  deactivate(hostname: string): Promise<void>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma. Note
 * this stores ONLY plugin-specific config; the install itself is a
 * LayerInstall row (see visibility-layer/contracts.ts).
 *
 * /// One row per WordPress install's plugin configuration.
 * model WordPressPluginConfig {
 *   id              String   @id @default(cuid())
 *   hostname        String   @unique
 *   pluginVersion   String
 *   wpVersion       String
 *   autoSyncEnabled Boolean  @default(true)
 *   updatedAt       DateTime @updatedAt
 *
 *   @@index([hostname])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
