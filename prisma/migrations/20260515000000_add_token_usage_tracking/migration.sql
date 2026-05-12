-- Migration: add_token_usage_tracking
--
-- Phase 1 of the cost optimization architecture pass — adds per-audit
-- token + cost visibility. Captures the `usage` block returned by the
-- Anthropic SDK after each `messages.create` call, plus a computed
-- USD cost from `src/lib/pricing.ts`.
--
-- All columns nullable so historic audits without usage data still
-- validate. No data backfill — only forward-looking audits populate.
--
--   inputTokens          INTEGER  — `response.usage.input_tokens`
--   outputTokens         INTEGER  — `response.usage.output_tokens`
--   cacheCreationTokens  INTEGER  — `response.usage.cache_creation_input_tokens`
--                                   (Anthropic prompt-caching: tokens used
--                                    to create a cache entry; billed at a
--                                    25% premium over input rate)
--   cacheReadTokens      INTEGER  — `response.usage.cache_read_input_tokens`
--                                   (cache hits; billed at 10% of input rate)
--   modelUsed            TEXT     — model ID at time of call (e.g.
--                                    "claude-sonnet-4-6"), so cost
--                                    queries stay correct across model
--                                    upgrades
--   estimatedCostUsd     DECIMAL(10,6) — sum of (tokens × rate) per
--                                        category. Decimal so per-audit
--                                        precision is preserved at sub-
--                                        cent granularity.
--
-- Apply with: npx prisma migrate deploy

ALTER TABLE "AuditOrder"
  ADD COLUMN "inputTokens"         INTEGER,
  ADD COLUMN "outputTokens"        INTEGER,
  ADD COLUMN "cacheCreationTokens" INTEGER,
  ADD COLUMN "cacheReadTokens"     INTEGER,
  ADD COLUMN "modelUsed"           TEXT,
  ADD COLUMN "estimatedCostUsd"    DECIMAL(10, 6);
