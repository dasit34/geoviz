-- Monitoring customer login (monitoring-only passwordless sign-in).
-- ADDITIVE ONLY: four new tables + two new MonitoringSubscription columns
-- (customerId nullable, priorStripeSubscriptionIds defaulting to empty).
-- No existing column, row, or constraint is altered or dropped.

-- AlterTable
ALTER TABLE "MonitoringSubscription" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "priorStripeSubscriptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MonitoringCustomer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringLoginToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringAuthRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringAuthRateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringCustomer_email_key" ON "MonitoringCustomer"("email");

-- CreateIndex
CREATE INDEX "MonitoringCustomer_stripeCustomerId_idx" ON "MonitoringCustomer"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringLoginToken_tokenHash_key" ON "MonitoringLoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MonitoringLoginToken_customerId_createdAt_idx" ON "MonitoringLoginToken"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSession_tokenHash_key" ON "MonitoringSession"("tokenHash");

-- CreateIndex
CREATE INDEX "MonitoringSession_customerId_idx" ON "MonitoringSession"("customerId");

-- CreateIndex
CREATE INDEX "MonitoringAuthRateLimit_windowStart_idx" ON "MonitoringAuthRateLimit"("windowStart");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_customerId_idx" ON "MonitoringSubscription"("customerId");

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "MonitoringCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringLoginToken" ADD CONSTRAINT "MonitoringLoginToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "MonitoringCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSession" ADD CONSTRAINT "MonitoringSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "MonitoringCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

