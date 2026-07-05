/**
 * GeoViz — Agency Platform module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. Deliberately lightweight RBAC, independent of the
 * `enterprise` module's fuller RBAC — see README.md.
 */

import type { Timestamp } from "@/lib/v2/contracts";

export interface AgencyAccount {
  id: string;
  agencyName: string;
  whiteLabelBrandName: string | null;
  whiteLabelLogoUrl: string | null;
  createdAt: Timestamp;
}

export interface AgencyClientLink {
  agencyId: string;
  hostname: string;
  linkedAt: Timestamp;
}

export interface AgencyPlatformService {
  createAgency(agencyName: string): Promise<AgencyAccount>;

  linkClient(agencyId: string, hostname: string): Promise<AgencyClientLink>;

  /** Bulk audit submission — one order per hostname, returns order IDs. */
  bulkAudit(agencyId: string, hostnames: string[]): Promise<{ orderIds: string[] }>;

  /** Aggregated portfolio view across every linked client. */
  portfolioSummary(agencyId: string): Promise<{
    clientCount: number;
    averageScore: number;
    scoresByHostname: Record<string, number>;
  }>;

  setWhiteLabelBranding(
    agencyId: string,
    branding: { brandName: string; logoUrl: string }
  ): Promise<AgencyAccount>;
}

/**
 * Proposed Prisma models — NOT applied to prisma/schema.prisma.
 *
 * model AgencyAccount {
 *   id                  String             @id @default(cuid())
 *   agencyName          String
 *   whiteLabelBrandName String?
 *   whiteLabelLogoUrl   String?
 *   createdAt           DateTime           @default(now())
 *   clients             AgencyClientLink[]
 *
 *   @@index([agencyName])
 * }
 *
 * /// Join table — one row per agency-to-client-hostname link.
 * model AgencyClientLink {
 *   id        String       @id @default(cuid())
 *   agencyId  String
 *   agency    AgencyAccount @relation(fields: [agencyId], references: [id], onDelete: Cascade)
 *   hostname  String
 *   linkedAt  DateTime     @default(now())
 *
 *   @@index([agencyId])
 *   @@index([hostname])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
