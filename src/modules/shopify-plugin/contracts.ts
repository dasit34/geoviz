/**
 * GeoViz — Shopify Plugin module contracts.
 *
 * Type-only seam describing the GeoViz-side API contract a future
 * Shopify embedded app would call. No runtime code, not imported by
 * V1 today. The Shopify app itself is out of scope for this repo.
 */

import type { LayerInstallRecord } from "@/modules/visibility-layer/contracts";

export interface ShopifyPluginConfig {
  hostname: string;
  shopDomain: string;
  appVersion: string;
  autoSyncEnabled: boolean;
}

export interface ShopifyPluginService {
  /** Called after Shopify OAuth install completes. */
  install(args: {
    hostname: string;
    shopDomain: string;
    appVersion: string;
  }): Promise<LayerInstallRecord>;

  syncNow(hostname: string): Promise<{ synced: boolean; syncedAt: number }>;

  /** Called from Shopify's mandatory app/uninstalled webhook. */
  uninstall(shopDomain: string): Promise<void>;

  /** Called from Shopify's mandatory GDPR data-erasure webhook. */
  eraseShopData(shopDomain: string): Promise<void>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// One row per Shopify install's app configuration.
 * model ShopifyPluginConfig {
 *   id              String   @id @default(cuid())
 *   hostname        String   @unique
 *   shopDomain      String   @unique
 *   appVersion      String
 *   autoSyncEnabled Boolean  @default(true)
 *   updatedAt       DateTime @updatedAt
 *
 *   @@index([hostname])
 *   @@index([shopDomain])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
