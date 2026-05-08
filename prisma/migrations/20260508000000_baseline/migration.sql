-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('pending', 'completed');

-- CreateTable
CREATE TABLE "AuditOrder" (
    "id" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "businessName" TEXT,
    "competitorUrl" TEXT,
    "stripeSessionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 9700,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "auditStatus" "AuditStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "adminEmailSentAt" TIMESTAMP(3),
    "reportStatus" TEXT NOT NULL DEFAULT 'pending',
    "reportMarkdown" TEXT,
    "reportError" TEXT,
    "reportQueuedAt" TIMESTAMP(3),
    "reportStartedAt" TIMESTAMP(3),
    "reportGeneratedAt" TIMESTAMP(3),
    "reportSentToCustomerAt" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "qualityScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditOrder_stripeSessionId_key" ON "AuditOrder"("stripeSessionId");

-- CreateIndex
CREATE INDEX "AuditOrder_email_idx" ON "AuditOrder"("email");

-- CreateIndex
CREATE INDEX "AuditOrder_createdAt_idx" ON "AuditOrder"("createdAt");

