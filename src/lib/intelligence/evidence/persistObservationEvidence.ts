/**
 * Intelligence Engine Phase 1 — evidence write path.
 *
 * Normalizes an ALREADY-COMPUTED `ValidationLayerResult` (the AI
 * validator layer's real per-provider output — see
 * `@/lib/validators/runAiValidationLayer`, which already runs
 * unconditionally on every paid audit) into the persistent
 * `Observation` / `QueryLibraryEntry` / `ObservationCompetitorMention`
 * tables.
 *
 * This module makes ZERO new LLM calls. It is a pure read-and-persist
 * step over data the caller already has in scope — see
 * `docs/INTELLIGENCE_ENGINE_GAP_ANALYSIS.md` for the full design
 * rationale (why this reuses the validator layer instead of the
 * separate, permanently-disabled `@/lib/observations/*` scaffold).
 *
 * Failure isolation contract, matching `persistAuditIntelligence`'s
 * own contract:
 *   - This function never throws. Every Prisma write is wrapped in
 *     its own try/catch so one malformed provider output, or one
 *     failed write, can never abort persistence for the others.
 *   - Callers should still wrap the call site in their own try/catch
 *     as an extra safety net (defense in depth), matching the
 *     existing fail-soft convention throughout `audit-intelligence.ts`.
 */

import { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";
import { normalizeIndustry } from "@/lib/intelligence/industry-taxonomy";
import { DISCOVERY_QUERY_TEXT } from "@/lib/validators/capture";
import type {
  CompetitiveCapture,
  NormalizedValidationOutput,
  ValidationLayerResult,
} from "@/lib/validators/types";

export type PersistObservationEvidenceResult = {
  observationsWritten: number;
  competitorMentionsWritten: number;
  queryEntriesTouched: number;
};

/** Lowercase/trim/collapse-whitespace — the dedup normalization used for
 * both query text and competitor names. Pure, deterministic. */
function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Best-effort: does this named entity refer to the subject business
 * itself (as opposed to an actual competitor)? Exact normalized-string
 * match only — documented limitation, not full entity resolution. */
function isSubjectBusiness(
  entityName: string,
  businessName: string | null,
): boolean {
  if (!businessName) return false;
  return normalizeText(entityName) === normalizeText(businessName);
}

/** self_assessment call type only — competitive_capture never has a
 * recommend verdict, so this is never called for that call type. */
function derivedRecommended(
  verdict: NormalizedValidationOutput["would_recommend"] | undefined,
): boolean | null {
  if (verdict === "YES") return true;
  if (verdict === "NO") return false;
  return null; // "PARTIAL" or absent — genuinely ambiguous, not a guess
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function writeSelfAssessmentObservation(args: {
  db: PrismaClient | Prisma.TransactionClient;
  orderId: string;
  businessId: string | null;
  output: NormalizedValidationOutput;
  captureVersion: string;
}): Promise<boolean> {
  const { db, orderId, businessId, output, captureVersion } = args;
  if (!output.prompt_text || !output.raw_response_text) return false;

  try {
    await db.observation.create({
      data: {
        auditOrderId: orderId,
        businessId,
        queryLibraryEntryId: null,
        callType: "self_assessment",
        provider: output.provider,
        model: output.model ?? null,
        modelVersion: output.model_version ?? null,
        status: output.status,
        promptText: output.prompt_text,
        rawResponseText: output.raw_response_text,
        mentioned: null,
        recommended: derivedRecommended(output.would_recommend),
        citations: toJson(output.cited_sources ?? []),
        citationDomains: toJson(output.cited_source_domains ?? []),
        parserOutput: toJson(output),
        parserVersion: output.prompt_version ?? captureVersion,
        observedAt: output.answer_retrieved_at
          ? new Date(output.answer_retrieved_at)
          : new Date(),
        executionMode: output.execution_mode ?? null,
        country: output.country ?? null,
        searchRegion: output.search_region ?? null,
      },
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[evidence] self_assessment write failed orderId=${orderId} provider=${output.provider} (non-fatal): ${msg}`,
    );
    return false;
  }
}

async function writeCompetitiveCaptureObservation(args: {
  db: PrismaClient | Prisma.TransactionClient;
  orderId: string;
  businessId: string | null;
  businessName: string | null;
  provider: string;
  providerModel: string | null;
  industryRaw: string | null;
  industryNormalized: string;
  competitive: CompetitiveCapture;
}): Promise<{ observationWritten: boolean; competitorMentionsWritten: number; queryEntryTouched: boolean }> {
  const {
    db,
    orderId,
    businessId,
    businessName,
    provider,
    providerModel,
    industryRaw,
    industryNormalized,
    competitive,
  } = args;

  let queryEntryTouched = false;
  let observationWritten = false;
  let competitorMentionsWritten = 0;

  try {
    const normalizedQueryText = normalizeText(DISCOVERY_QUERY_TEXT);
    const geographyRaw =
      (competitive.inferred_location ?? "").trim().toLowerCase() ||
      "unspecified";

    // Lookup-or-create keyed on the AUDIT-LEVEL industryNormalized (the
    // frozen taxonomy), not this provider's own free-text
    // inferred_category — different providers can infer slightly
    // different categories for the same business, and that variance
    // must not fragment the dedup key. Each provider's own inference
    // is preserved losslessly in the Observation's parserOutput below.
    const entry = await db.queryLibraryEntry.upsert({
      where: {
        normalizedQueryText_industryNormalized_geographyRaw: {
          normalizedQueryText,
          industryNormalized,
          geographyRaw,
        },
      },
      update: {},
      create: {
        queryText: DISCOVERY_QUERY_TEXT,
        normalizedQueryText,
        industryRaw,
        industryNormalized,
        geographyRaw,
        intent: "recommendation",
        queryType: "competitive_capture_template",
        businessId: null,
        source: "validator_competitive_capture",
      },
      select: { id: true },
    });
    queryEntryTouched = true;

    const observation = await db.observation.create({
      data: {
        auditOrderId: orderId,
        businessId,
        queryLibraryEntryId: entry.id,
        callType: "competitive_capture",
        provider,
        model: competitive.model ?? providerModel,
        modelVersion: competitive.model_version ?? null,
        status: competitive.status,
        promptText: DISCOVERY_QUERY_TEXT,
        rawResponseText: competitive.raw_response,
        mentioned: competitive.business_named,
        recommended: null,
        citations: toJson([]),
        citationDomains: toJson([]),
        parserOutput: toJson(competitive),
        parserVersion: competitive.prompt_version,
        observedAt: competitive.retrieved_at
          ? new Date(competitive.retrieved_at)
          : new Date(),
        executionMode: competitive.execution_mode ?? null,
        country: competitive.country ?? null,
        searchRegion: competitive.search_region ?? null,
      },
      select: { id: true },
    });
    observationWritten = true;

    const entities = Array.isArray(competitive.entities)
      ? competitive.entities
      : [];
    for (let i = 0; i < entities.length; i += 1) {
      const name = entities[i];
      if (typeof name !== "string" || !name.trim()) continue;
      if (isSubjectBusiness(name, businessName)) continue;
      try {
        await db.observationCompetitorMention.create({
          data: {
            observationId: observation.id,
            competitorName: name,
            competitorNormalized: normalizeText(name),
            position: i,
            wasRecommended: null,
          },
        });
        competitorMentionsWritten += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[evidence] competitor mention write failed orderId=${orderId} provider=${provider} (non-fatal): ${msg}`,
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[evidence] competitive_capture write failed orderId=${orderId} provider=${provider} (non-fatal): ${msg}`,
    );
  }

  return { observationWritten, competitorMentionsWritten, queryEntryTouched };
}

export async function persistObservationEvidence(args: {
  /** Injectable for testing — defaults to the shared singleton client. */
  prisma?: PrismaClient | Prisma.TransactionClient;
  orderId: string;
  businessName: string | null;
  websiteUrl: string;
  industryRaw: string | null;
  validatorResult: ValidationLayerResult;
}): Promise<PersistObservationEvidenceResult> {
  const db = args.prisma ?? defaultPrisma;
  const result: PersistObservationEvidenceResult = {
    observationsWritten: 0,
    competitorMentionsWritten: 0,
    queryEntriesTouched: 0,
  };

  // Best-effort businessId lookup — a failure here just leaves every
  // written Observation's businessId null, it never aborts the run.
  let businessId: string | null = null;
  try {
    const order = await db.auditOrder.findUnique({
      where: { id: args.orderId },
      select: { businessId: true },
    });
    businessId = order?.businessId ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[evidence] businessId lookup failed orderId=${args.orderId} (non-fatal): ${msg}`,
    );
  }

  const { normalized: industryNormalized } = normalizeIndustry(
    args.industryRaw,
  );
  const captureVersion =
    args.validatorResult.capture_version ?? "capture@1.0.0";

  for (const output of args.validatorResult.outputs) {
    if (output.status !== "passed") continue;

    const selfAssessmentWritten = await writeSelfAssessmentObservation({
      db,
      orderId: args.orderId,
      businessId,
      output,
      captureVersion,
    });
    if (selfAssessmentWritten) result.observationsWritten += 1;

    const competitive = output.competitive;
    if (!competitive || competitive.status !== "passed" || !competitive.raw_response) {
      continue;
    }

    const {
      observationWritten,
      competitorMentionsWritten,
      queryEntryTouched,
    } = await writeCompetitiveCaptureObservation({
      db,
      orderId: args.orderId,
      businessId,
      businessName: args.businessName,
      provider: output.provider,
      providerModel: output.model ?? null,
      industryRaw: args.industryRaw,
      industryNormalized,
      competitive,
    });
    if (observationWritten) result.observationsWritten += 1;
    result.competitorMentionsWritten += competitorMentionsWritten;
    if (queryEntryTouched) result.queryEntriesTouched += 1;
  }

  return result;
}
