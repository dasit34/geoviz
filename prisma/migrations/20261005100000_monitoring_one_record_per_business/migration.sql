-- One monitoring record per (buyer email, business website).
-- ADDITIVE ONLY: nullable MonitoringSubscription.siteKey, a UNIQUE index on
-- (email, siteKey) — NULLs are distinct in PostgreSQL, so existing rows can't
-- violate it — and the MonitoringDuplicateSubscription ledger. Legacy rows get
-- siteKey from scripts/backfill-monitoring-site-keys.ts or lazily on sync.

-- AlterTable
ALTER TABLE "MonitoringSubscription" ADD COLUMN     "siteKey" TEXT;

-- CreateTable
CREATE TABLE "MonitoringDuplicateSubscription" (
    "id" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "monitoringSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "status" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringDuplicateSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringDuplicateSubscription_stripeSubscriptionId_key" ON "MonitoringDuplicateSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "MonitoringDuplicateSubscription_monitoringSubscriptionId_idx" ON "MonitoringDuplicateSubscription"("monitoringSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSubscription_email_siteKey_key" ON "MonitoringSubscription"("email", "siteKey");

-- AddForeignKey
ALTER TABLE "MonitoringDuplicateSubscription" ADD CONSTRAINT "MonitoringDuplicateSubscription_monitoringSubscriptionId_fkey" FOREIGN KEY ("monitoringSubscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

