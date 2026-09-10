-- AlterTable
ALTER TABLE "AuditOrder" ADD COLUMN     "businessId" TEXT;

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "primaryWebsiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_normalizedDomain_key" ON "Business"("normalizedDomain");

-- CreateIndex
CREATE INDEX "Business_createdAt_idx" ON "Business"("createdAt");

-- CreateIndex
CREATE INDEX "AuditOrder_businessId_idx" ON "AuditOrder"("businessId");

-- AddForeignKey
ALTER TABLE "AuditOrder" ADD CONSTRAINT "AuditOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
