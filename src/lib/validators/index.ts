/**
 * @module @/lib/validators
 *
 * AI VALIDATOR LAYER — DESIGN INVARIANTS
 *
 * 1. LLMs DO NOT CREATE THE GEOVIZ SCORE.
 *    The deterministic scoring engine in `src/lib/scoring/` remains
 *    the canonical source of truth. This module never modifies,
 *    replaces, or influences the score.
 *
 * 2. Validators are cross-model INTERPRETATION CHECKS.
 *    They run AFTER the deterministic score is produced and ask AI
 *    systems how they interpret the business — can they identify
 *    what it does, what services it offers, where it operates;
 *    would they recommend it; what facts are missing.
 *
 * 3. Per-provider fail-soft on API-key absence.
 *    A provider whose `*_API_KEY` is missing returns
 *    `status: "unavailable"`. No master enable/disable flag — if the
 *    key is set, the provider runs; if not, the layer + report UI
 *    degrade gracefully. Google AI Overviews has no public API and is
 *    permanently `unavailable`.
 *
 * 4. Wired into production.
 *    `runAiValidationLayer` is called from
 *    `src/lib/audit-intelligence.ts::persistAuditIntelligence` after
 *    the deterministic score is written. Result persists to
 *    `AuditIntelligence.aiValidations` (raw outputs) and is rolled
 *    into `AuditIntelligence.consensusIndex` by `src/lib/consensus/`.
 *
 * 5. Public surface — ONE function.
 *    Only `runAiValidationLayer` is exported from this module.
 *    Internal types, registry, providers, devLog helper, and test
 *    fixtures are accessible by direct path import (e.g.,
 *    `@/lib/validators/types`) but are NOT re-exported here.
 */

export { runAiValidationLayer } from "./runAiValidationLayer";
