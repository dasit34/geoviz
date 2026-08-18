-- AlterTable
ALTER TABLE "AuditOrder" ADD COLUMN     "orderType" TEXT;

-- CreateIndex
CREATE INDEX "AuditOrder_orderType_idx" ON "AuditOrder"("orderType");
