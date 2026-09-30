-- AlterTable
ALTER TABLE "AuditOrder" ADD COLUMN     "monitoringSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "MonitoringSubscription" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "status" TEXT NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "websiteUrl" TEXT NOT NULL,
    "businessName" TEXT,
    "email" TEXT NOT NULL,
    "businessId" TEXT,
    "baselineAuditOrderId" TEXT,
    "cadenceDays" INTEGER NOT NULL,
    "nextAuditAt" TIMESTAMP(3),
    "lastAuditQueuedAt" TIMESTAMP(3),
    "welcomeEmailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSubscription_accessToken_key" ON "MonitoringSubscription"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSubscription_stripeSubscriptionId_key" ON "MonitoringSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSubscription_stripeCheckoutSessionId_key" ON "MonitoringSubscription"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_status_nextAuditAt_idx" ON "MonitoringSubscription"("status", "nextAuditAt");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_businessId_idx" ON "MonitoringSubscription"("businessId");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_email_idx" ON "MonitoringSubscription"("email");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_receivedAt_idx" ON "StripeWebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "AuditOrder_monitoringSubscriptionId_idx" ON "AuditOrder"("monitoringSubscriptionId");

-- AddForeignKey
ALTER TABLE "AuditOrder" ADD CONSTRAINT "AuditOrder_monitoringSubscriptionId_fkey" FOREIGN KEY ("monitoringSubscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

