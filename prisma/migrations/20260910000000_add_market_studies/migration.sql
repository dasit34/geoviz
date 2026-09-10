-- CreateTable
CREATE TABLE "MarketStudy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "city" TEXT,
    "state" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketStudyEntry" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "leadId" TEXT,
    "auditOrderId" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketStudyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketStudy_createdAt_idx" ON "MarketStudy"("createdAt");

-- CreateIndex
CREATE INDEX "MarketStudyEntry_studyId_idx" ON "MarketStudyEntry"("studyId");

-- CreateIndex
CREATE INDEX "MarketStudyEntry_auditOrderId_idx" ON "MarketStudyEntry"("auditOrderId");

-- CreateIndex
CREATE INDEX "MarketStudyEntry_leadId_idx" ON "MarketStudyEntry"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketStudyEntry_studyId_leadId_key" ON "MarketStudyEntry"("studyId", "leadId");

-- AddForeignKey
ALTER TABLE "MarketStudyEntry" ADD CONSTRAINT "MarketStudyEntry_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "MarketStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketStudyEntry" ADD CONSTRAINT "MarketStudyEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketStudyEntry" ADD CONSTRAINT "MarketStudyEntry_auditOrderId_fkey" FOREIGN KEY ("auditOrderId") REFERENCES "AuditOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
