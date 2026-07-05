/**
 * GeoViz — Monitoring module contracts.
 *
 * Type-only seam. No runtime code, no side effects, not imported by
 * V1 today. Composes ai-answer-sampling + change-detection + alerts
 * — does not reimplement any of their logic.
 */

import type {
  VisibilityHistory,
  VisibilitySnapshot,
} from "@/lib/v2/contracts";
import type { AnswerSnapshot } from "@/modules/ai-answer-sampling/contracts";
import type { ChangeEvent } from "@/modules/change-detection/contracts";
import type { AlertNotification } from "@/modules/alerts/contracts";

export type MonitoringCadence = "weekly" | "daily";

export interface MonitoringSubscription {
  id: string;
  hostname: string;
  cadence: MonitoringCadence;
  isActive: boolean;
  startedAt: number;
}

/** Composed dashboard view — the retention-critical customer-facing shape. */
export interface MonitoringDashboardView {
  hostname: string;
  history: VisibilityHistory;
  latestSnapshot: VisibilitySnapshot;
  /** Never empty when the subscription has run at least one sampling pass. */
  recentEvidence: AnswerSnapshot[];
  recentChanges: ChangeEvent[];
  activeAlerts: AlertNotification[];
  churnRisk: "low" | "elevated" | "high";
}

export interface MonitoringService {
  subscribe(args: {
    hostname: string;
    cadence: MonitoringCadence;
  }): Promise<MonitoringSubscription>;

  cancel(subscriptionId: string): Promise<void>;

  dashboard(hostname: string): Promise<MonitoringDashboardView>;

  /** Churn-risk = score plateau + no evidence viewed in the window (see README "Purpose"). */
  computeChurnRisk(hostname: string): Promise<"low" | "elevated" | "high">;
}

/**
 * Proposed Prisma model — NOT applied to prisma/schema.prisma.
 *
 * /// One row per active/historical monitoring subscription. Billing
 * /// state only — score/evidence history lives in AiAnswerSnapshot,
 * /// ChangeEvent, and the existing ObservationHistory/
 * /// AuditIntelligence models, referenced by hostname, not
 * /// duplicated here.
 * model MonitoringSubscription {
 *   id         String   @id @default(cuid())
 *   hostname   String
 *   cadence    String   // MonitoringCadence, see contracts.ts
 *   isActive   Boolean  @default(true)
 *   startedAt  DateTime @default(now())
 *   cancelledAt DateTime?
 *
 *   @@index([hostname])
 *   @@index([isActive])
 * }
 */
export type __ProposedPrismaModelDocOnly = never;
