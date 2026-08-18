-- AlterTable
ALTER TABLE "AuditOrder" ADD COLUMN     "previousAuditOrderId" TEXT;

-- CreateIndex
CREATE INDEX "AuditOrder_previousAuditOrderId_idx" ON "AuditOrder"("previousAuditOrderId");

-- AddForeignKey
ALTER TABLE "AuditOrder" ADD CONSTRAINT "AuditOrder_previousAuditOrderId_fkey" FOREIGN KEY ("previousAuditOrderId") REFERENCES "AuditOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
