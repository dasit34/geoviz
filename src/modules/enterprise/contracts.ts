/**
 * GeoViz — Enterprise module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. Deliberately its own RBAC implementation, independent of
 * `agency-platform`'s lightweight model — see README.md.
 */

import type { Timestamp } from "@/lib/v2/contracts";
import type { MonitoringDashboardView } from "@/modules/monitoring/contracts";
import type { LayerInstallRecord } from "@/modules/visibility-layer/contracts";

export type RbacRole = "account_owner" | "regional_manager" | "location_user";

export interface RbacGrant {
  userId: string;
  enterpriseAccountId: string;
  role: RbacRole;
  /** Location IDs this grant is scoped to. Empty = full account (account_owner only). */
  scopedLocationIds: string[];
}

export interface EnterpriseAccount {
  id: string;
  accountName: string;
  createdAt: Timestamp;
}

export interface EnterpriseLocation {
  id: string;
  enterpriseAccountId: string;
  hostname: string;
  regionLabel: string | null;
  layerInstall: LayerInstallRecord | null;
}

export interface AuditTrailEntry {
  id: string;
  hostname: string;
  eventKind: "score" | "alert" | "change";
  methodologyVersion: string;
  sourceRef: string;
  recordedAt: Timestamp;
}

export interface EnterpriseService {
  createAccount(accountName: string): Promise<EnterpriseAccount>;

  bulkOnboard(
    enterpriseAccountId: string,
    hostnames: string[]
  ): Promise<EnterpriseLocation[]>;

  grantAccess(grant: Omit<RbacGrant, never>): Promise<RbacGrant>;

  /** Returns only the locations the requesting grant is scoped to. */
  locationsFor(grant: RbacGrant): Promise<EnterpriseLocation[]>;

  dashboardFor(hostname: string): Promise<MonitoringDashboardView>;

  auditTrail(hostname: string, sinceDays: number): Promise<AuditTrailEntry[]>;
}

/**
 * Proposed Prisma models — NOT applied to prisma/schema.prisma.
 *
 * model EnterpriseAccount {
 *   id          String              @id @default(cuid())
 *   accountName String
 *   createdAt   DateTime            @default(now())
 *   locations   EnterpriseLocation[]
 *   grants      RbacGrant[]
 * }
 *
 * model EnterpriseLocation {
 *   id                  String            @id @default(cuid())
 *   enterpriseAccountId String
 *   account             EnterpriseAccount @relation(fields: [enterpriseAccountId], references: [id], onDelete: Cascade)
 *   hostname            String
 *   regionLabel         String?
 *
 *   @@index([enterpriseAccountId])
 *   @@index([hostname])
 * }
 *
 * model RbacGrant {
 *   id                  String            @id @default(cuid())
 *   userId              String
 *   enterpriseAccountId String
 *   account             EnterpriseAccount @relation(fields: [enterpriseAccountId], references: [id], onDelete: Cascade)
 *   role                String            // RbacRole, see contracts.ts
 *   scopedLocationIds   Json              // string[]
 *
 *   @@index([enterpriseAccountId])
 *   @@index([userId])
 * }
 *
 * /// Append-only audit trail. NEVER updated, NEVER overwritten —
 * /// this is the enterprise-procurement-facing provenance record.
 * model AuditTrailEntry {
 *   id                 String   @id @default(cuid())
 *   hostname           String
 *   eventKind          String   // "score" | "alert" | "change"
 *   methodologyVersion String
 *   sourceRef          String
 *   recordedAt         DateTime @default(now())
 *
 *   @@index([hostname])
 *   @@index([recordedAt])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
