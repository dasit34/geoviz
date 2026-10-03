-- Duplicate-billing guard for monitoring (defense in depth).
-- ADDITIVE ONLY: MonitoringCheckoutLease (one open Checkout session per
-- buyer email + business) and automatic-compensation columns on
-- MonitoringDuplicateSubscription (all nullable or defaulted).

-- AlterTable
ALTER TABLE "MonitoringDuplicateSubscription" ADD COLUMN     "adminNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "canceledInStripeAt" TIMESTAMP(3),
ADD COLUMN     "compensatedAt" TIMESTAMP(3),
ADD COLUMN     "compensationClaimedAt" TIMESTAMP(3),
ADD COLUMN     "customerNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "history" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "refundCurrency" TEXT,
ADD COLUMN     "refundStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stripeRefundIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MonitoringCheckoutLease" (
    "leaseKey" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "monitoringSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "stripeCheckoutSessionId" TEXT,
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringCheckoutLease_pkey" PRIMARY KEY ("leaseKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringCheckoutLease_stripeCheckoutSessionId_key" ON "MonitoringCheckoutLease"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "MonitoringDuplicateSubscription_compensatedAt_idx" ON "MonitoringDuplicateSubscription"("compensatedAt");

