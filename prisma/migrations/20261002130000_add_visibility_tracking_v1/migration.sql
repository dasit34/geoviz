-- CreateTable
CREATE TABLE "TrackedPrompt" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "TrackedPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedCompetitor" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "domain" TEXT,
    "source" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "TrackedCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringCycle" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "promptIds" JSONB NOT NULL,
    "providers" JSONB NOT NULL,
    "competitors" JSONB NOT NULL,
    "summary" JSONB,
    "metricsVersion" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "MonitoringCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptRunResult" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "trackedPromptId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "groundingMode" TEXT,
    "mentioned" BOOLEAN,
    "position" INTEGER,
    "citedUrls" JSONB NOT NULL,
    "citedDomains" JSONB NOT NULL,
    "namedBusinesses" JSONB NOT NULL,
    "competitorIdsMentioned" JSONB NOT NULL,
    "matchEvidence" JSONB,
    "detectorVersion" TEXT,
    "answerText" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,

    CONSTRAINT "PromptRunResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackedPrompt_subscriptionId_isActive_idx" ON "TrackedPrompt"("subscriptionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedPrompt_subscriptionId_normalizedText_key" ON "TrackedPrompt"("subscriptionId", "normalizedText");

-- CreateIndex
CREATE INDEX "TrackedCompetitor_subscriptionId_isActive_idx" ON "TrackedCompetitor"("subscriptionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedCompetitor_subscriptionId_normalizedName_key" ON "TrackedCompetitor"("subscriptionId", "normalizedName");

-- CreateIndex
CREATE INDEX "MonitoringCycle_subscriptionId_startedAt_idx" ON "MonitoringCycle"("subscriptionId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringCycle_subscriptionId_cycleKey_key" ON "MonitoringCycle"("subscriptionId", "cycleKey");

-- CreateIndex
CREATE INDEX "PromptRunResult_subscriptionId_provider_idx" ON "PromptRunResult"("subscriptionId", "provider");

-- CreateIndex
CREATE INDEX "PromptRunResult_trackedPromptId_idx" ON "PromptRunResult"("trackedPromptId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptRunResult_cycleId_trackedPromptId_provider_key" ON "PromptRunResult"("cycleId", "trackedPromptId", "provider");

-- AddForeignKey
ALTER TABLE "TrackedPrompt" ADD CONSTRAINT "TrackedPrompt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedCompetitor" ADD CONSTRAINT "TrackedCompetitor_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringCycle" ADD CONSTRAINT "MonitoringCycle_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptRunResult" ADD CONSTRAINT "PromptRunResult_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MonitoringCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptRunResult" ADD CONSTRAINT "PromptRunResult_trackedPromptId_fkey" FOREIGN KEY ("trackedPromptId") REFERENCES "TrackedPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

