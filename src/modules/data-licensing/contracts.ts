/**
 * GeoViz — Data Licensing module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today.
 */

import type { Timestamp } from "@/lib/v2/contracts";
import type { PublishedBenchmark } from "@/modules/benchmark-engine/contracts";
import type { CohortRecomputation } from "@/modules/cohort-analysis/contracts";

export interface LicenseAgreement {
  id: string;
  licenseeName: string;
  scope: string;
  /** Explicit usage terms — never allows re-licensing or re-identification. */
  usageTerms: string;
  startedAt: Timestamp;
  expiresAt: Timestamp | null;
}

export interface LicenseDelivery {
  id: string;
  licenseAgreementId: string;
  datasetScope: string;
  methodologyVersion: string;
  deliveredAt: Timestamp;
}

export interface DataLicensingService {
  createAgreement(args: {
    licenseeName: string;
    scope: string;
    usageTerms: string;
  }): Promise<LicenseAgreement>;

  /** Delivers only already-aggregated data; refuses anything below the sample-size floor. */
  deliver(args: {
    licenseAgreementId: string;
    benchmark?: PublishedBenchmark;
    cohortRecomputation?: CohortRecomputation;
  }): Promise<LicenseDelivery>;

  deliveryHistory(licenseAgreementId: string): Promise<LicenseDelivery[]>;
}

/**
 * Proposed Prisma models — NOT applied to prisma/schema.prisma.
 *
 * model LicenseAgreement {
 *   id            String   @id @default(cuid())
 *   licenseeName  String
 *   scope         String
 *   usageTerms    String   @db.Text
 *   startedAt     DateTime @default(now())
 *   expiresAt     DateTime?
 *
 *   @@index([licenseeName])
 * }
 *
 * /// Append-only delivery log — the enforcement record for licensing
 * /// terms. NEVER updated, NEVER overwritten.
 * model LicenseDeliveryLog {
 *   id                 String   @id @default(cuid())
 *   licenseAgreementId String
 *   datasetScope       String
 *   methodologyVersion String
 *   deliveredAt        DateTime @default(now())
 *
 *   @@index([licenseAgreementId])
 *   @@index([deliveredAt])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
