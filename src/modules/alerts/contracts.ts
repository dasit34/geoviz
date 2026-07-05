/**
 * GeoViz — Alerts module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today.
 */

import type { Timestamp } from "@/lib/v2/contracts";
import type { ChangeEvent } from "@/modules/change-detection/contracts";

export type AlertEngagementState = "unseen" | "viewed" | "acted" | "ignored";

export interface AlertNotification {
  id: string;
  hostname: string;
  sourceChangeEvent: ChangeEvent;
  /** Never empty — every alert must carry a concrete recommended action. */
  recommendedAction: string;
  engagementState: AlertEngagementState;
  deliveredAt: Timestamp;
}

export interface AlertsService {
  /** Create and deliver an alert from a detected change event. */
  fire(changeEvent: ChangeEvent): Promise<AlertNotification>;

  markEngagement(
    alertId: string,
    state: AlertEngagementState
  ): Promise<void>;

  feed(hostname: string, sinceDays: number): Promise<AlertNotification[]>;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// Append-only alert log with a mutable engagementState column
 * /// (the only field ever updated post-insert — everything else is
 * /// immutable, matching the delivered-evidence pattern used
 * /// elsewhere in the data moat).
 * model AlertNotification {
 *   id                String   @id @default(cuid())
 *   hostname          String
 *   changeEventId     String
 *   recommendedAction String
 *   engagementState   String   @default("unseen") // AlertEngagementState
 *   deliveredAt       DateTime @default(now())
 *
 *   @@index([hostname])
 *   @@index([deliveredAt])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
