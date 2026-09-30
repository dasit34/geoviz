-- CreateTable
CREATE TABLE "MarketStudyAutomationRun" (
    "id" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "isManualTest" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'running',
    "industry" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "targetCount" INTEGER NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "leadDiscoveryRunId" TEXT,
    "marketStudyId" TEXT,
    "businessesCollected" INTEGER NOT NULL DEFAULT 0,
    "businessesQualified" INTEGER NOT NULL DEFAULT 0,
    "duplicatesExcluded" INTEGER NOT NULL DEFAULT 0,
    "existingCustomersExcluded" INTEGER NOT NULL DEFAULT 0,
    "blockedExcluded" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summaryEmailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketStudyAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketStudyAutomationRun_runDate_key" ON "MarketStudyAutomationRun"("runDate");

-- CreateIndex
CREATE INDEX "MarketStudyAutomationRun_status_idx" ON "MarketStudyAutomationRun"("status");
