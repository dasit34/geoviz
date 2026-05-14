-- Customer-facing failure safety layer (launch-hardening).
--
-- Adds a single nullable timestamp to AuditOrder so the worker can
-- mark whether the customer-facing "delayed" or "failed" email has
-- already been sent for a given audit. Prevents double-sends if the
-- worker re-classifies the same terminal state on a future pass.
--
-- Backwards compatible: existing rows default to NULL.

ALTER TABLE "AuditOrder"
  ADD COLUMN "customerFailureNotifiedAt" TIMESTAMP(3);
