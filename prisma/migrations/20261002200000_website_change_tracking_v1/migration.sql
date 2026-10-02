-- AlterTable
ALTER TABLE "TrackedCompetitor" ADD COLUMN     "domainConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WebsiteScan" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "trackedCompetitorId" TEXT,
    "siteKind" TEXT NOT NULL,
    "siteDomain" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "scannerVersion" TEXT NOT NULL,
    "robotsOutcome" TEXT,
    "discoveredUrls" JSONB,
    "discoveryComplete" BOOLEAN NOT NULL DEFAULT false,
    "diffOutcome" TEXT,
    "comparedToScanId" TEXT,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "pagesAttempted" INTEGER NOT NULL DEFAULT 0,
    "pagesOk" INTEGER NOT NULL DEFAULT 0,
    "pagesFailed" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "bytesFetched" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WebsiteScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageSnapshot" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "siteDomain" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "discoveredVia" TEXT NOT NULL,
    "fetchStatus" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "finalUrl" TEXT,
    "fetchError" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "headings" JSONB NOT NULL,
    "contentBlocks" JSONB NOT NULL,
    "contentFingerprint" TEXT,
    "structuredData" JSONB,
    "identity" JSONB,
    "services" JSONB NOT NULL,
    "locations" JSONB NOT NULL,
    "scannerVersion" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteChange" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "siteDomain" TEXT NOT NULL,
    "siteKind" TEXT NOT NULL,
    "trackedCompetitorId" TEXT,
    "fromScanId" TEXT NOT NULL,
    "toScanId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "beforeExcerpt" TEXT,
    "afterExcerpt" TEXT,
    "detail" JSONB,
    "fromFetchedAt" TIMESTAMP(3) NOT NULL,
    "toFetchedAt" TIMESTAMP(3) NOT NULL,
    "diffVersion" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteScan_status_nextRetryAt_idx" ON "WebsiteScan"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WebsiteScan_subscriptionId_siteDomain_completedAt_idx" ON "WebsiteScan"("subscriptionId", "siteDomain", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteScan_subscriptionId_cycleKey_siteDomain_key" ON "WebsiteScan"("subscriptionId", "cycleKey", "siteDomain");

-- CreateIndex
CREATE INDEX "PageSnapshot_subscriptionId_siteDomain_idx" ON "PageSnapshot"("subscriptionId", "siteDomain");

-- CreateIndex
CREATE UNIQUE INDEX "PageSnapshot_scanId_normalizedUrl_key" ON "PageSnapshot"("scanId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "WebsiteChange_subscriptionId_toFetchedAt_idx" ON "WebsiteChange"("subscriptionId", "toFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteChange_toScanId_changeType_url_key" ON "WebsiteChange"("toScanId", "changeType", "url");

-- AddForeignKey
ALTER TABLE "WebsiteScan" ADD CONSTRAINT "WebsiteScan_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageSnapshot" ADD CONSTRAINT "PageSnapshot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

