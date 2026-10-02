-- CreateTable
CREATE TABLE "BusinessFactSheet" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "facts" JSONB NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessFactSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementTask" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "openKey" TEXT,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fixKind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "url" TEXT,
    "priority" INTEGER NOT NULL,
    "priorityReason" TEXT NOT NULL,
    "proposedFix" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'unassigned',
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "verificationMethod" TEXT NOT NULL,
    "expectation" JSONB,
    "implementationUrl" TEXT,
    "implementationNotes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "implementedAt" TIMESTAMP(3),
    "implementedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissReason" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImprovementTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementDraft" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "missingFacts" JSONB NOT NULL,
    "factSheetVersion" INTEGER,
    "generatorVersion" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementVerification" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "url" TEXT NOT NULL,
    "expected" JSONB NOT NULL,
    "observed" JSONB,
    "outcome" TEXT,
    "fetchStatus" TEXT,
    "lastError" TEXT,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessFactSheet_subscriptionId_version_key" ON "BusinessFactSheet"("subscriptionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ImprovementTask_openKey_key" ON "ImprovementTask"("openKey");

-- CreateIndex
CREATE INDEX "ImprovementTask_subscriptionId_status_idx" ON "ImprovementTask"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "ImprovementTask_subscriptionId_dedupeKey_idx" ON "ImprovementTask"("subscriptionId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImprovementDraft_taskId_version_key" ON "ImprovementDraft"("taskId", "version");

-- CreateIndex
CREATE INDEX "ImprovementEvent_taskId_createdAt_idx" ON "ImprovementEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ImprovementVerification_status_nextRetryAt_idx" ON "ImprovementVerification"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ImprovementVerification_taskId_createdAt_idx" ON "ImprovementVerification"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessFactSheet" ADD CONSTRAINT "BusinessFactSheet_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementTask" ADD CONSTRAINT "ImprovementTask_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementDraft" ADD CONSTRAINT "ImprovementDraft_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImprovementTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementEvent" ADD CONSTRAINT "ImprovementEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImprovementTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementVerification" ADD CONSTRAINT "ImprovementVerification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImprovementTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

