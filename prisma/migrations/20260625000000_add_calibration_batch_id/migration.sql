-- AddColumn AuditOrder.calibrationBatchId (nullable, no default)
-- Groups all orders from one Launch QA batch submission. Historic rows stay null.
ALTER TABLE "AuditOrder" ADD COLUMN "calibrationBatchId" TEXT;
