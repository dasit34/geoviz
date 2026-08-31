-- CreateTable
CREATE TABLE "LeadList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadListMembership" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "leadListId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadListMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadList_createdAt_idx" ON "LeadList"("createdAt");

-- CreateIndex
CREATE INDEX "LeadListMembership_leadListId_idx" ON "LeadListMembership"("leadListId");

-- CreateIndex
CREATE INDEX "LeadListMembership_leadId_idx" ON "LeadListMembership"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadListMembership_leadId_leadListId_key" ON "LeadListMembership"("leadId", "leadListId");

-- AddForeignKey
ALTER TABLE "LeadListMembership" ADD CONSTRAINT "LeadListMembership_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadListMembership" ADD CONSTRAINT "LeadListMembership_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
