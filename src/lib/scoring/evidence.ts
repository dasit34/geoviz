/**
 * Pure normalizer — turns the raw preflight + ingest + render results
 * into a single `Evidence` object the scoring module can read from.
 *
 * The scoring module ONLY reads from `Evidence`. It never reaches
 * back into preflight types or render-provider types, so any future
 * shape change in those modules is contained to this file.
 *
 * Pure — no I/O, no Date, no random. Idempotent.
 */

import type { PreflightSignals } from "@/lib/intelligence/preflight/types";
import type { IntelligenceIngestResult } from "@/lib/intelligence/intelligenceIngest";
import type { RenderIntelligenceResult } from "@/lib/intelligence/render/renderProvider";
import type { Evidence } from "./types";

export function gatherEvidence(args: {
  preflightSignals: PreflightSignals | null;
  intelligenceIngest: IntelligenceIngestResult | null;
  renderResult: RenderIntelligenceResult | null;
}): Evidence {
  const { preflightSignals, intelligenceIngest, renderResult } = args;

  const schema = preflightSignals?.schema ?? null;
  const crawl = preflightSignals?.crawlability ?? null;
  const entity = preflightSignals?.entityConsistency ?? null;
  const readable = preflightSignals?.readability ?? null;

  const detectedTypes = schema?.detectedTypes ?? [];
  const hasFaqSchema = detectedTypes.some((t) =>
    /^FAQPage$/i.test((t ?? "").toString()),
  );

  // Readability gives us a best-effort h1 signal indirectly via
  // `parsedByReadability`; Mozilla Readability requires a usable
  // heading-anchored article. When `parsedByReadability` is true we
  // can assume the page has at least one usable heading.
  const hasH1: boolean | null = readable
    ? readable.parsedByReadability === true
    : null;

  return {
    url: preflightSignals?.fetchedUrl ?? null,
    fetch_ok: preflightSignals?.fetchOk ?? false,

    schema: schema
      ? {
          raw_jsonld_block_count: schema.rawJsonLdCount ?? 0,
          detected_types: detectedTypes,
          present_fields: schema.presentFields ?? [],
          missing_fields: schema.missingFields ?? [],
          malformed_fields: schema.malformedFields ?? [],
          analyzer_score:
            typeof schema.score === "number" ? schema.score : null,
        }
      : null,

    crawlability: crawl
      ? {
          passed_checks: crawl.passedChecks ?? [],
          failed_checks: crawl.failedChecks ?? [],
          findings: crawl.findings ?? [],
          warnings: crawl.warnings ?? [],
          analyzer_score:
            typeof crawl.score === "number" ? crawl.score : null,
        }
      : null,

    entity: entity
      ? {
          name: entity.extractedEntities?.name ?? {
            schema: null,
            homepage: null,
            footer: null,
          },
          phone: entity.extractedEntities?.phone ?? {
            schema: null,
            homepage: null,
            footer: null,
          },
          address: entity.extractedEntities?.address ?? {
            schema: null,
            homepage: null,
            footer: null,
          },
          inconsistencies: entity.inconsistencies ?? [],
          surface_agreement:
            typeof entity.confidence === "number" ? entity.confidence : null,
          analyzer_score:
            typeof entity.score === "number" ? entity.score : null,
        }
      : null,

    content:
      readable || intelligenceIngest
        ? {
            word_count: readable?.wordCount ?? null,
            text_length: readable?.textLength ?? null,
            parsed_by_readability: readable?.parsedByReadability ?? null,
            fallback_used: readable?.fallbackUsed ?? null,
            has_h1: hasH1,
            ai_readability_score:
              intelligenceIngest?.aiReadabilityScore ?? null,
            content_density: intelligenceIngest?.contentDensity ?? null,
            has_faq_schema: hasFaqSchema,
          }
        : null,

    render: renderResult
      ? {
          attempted: renderResult.renderAttempted,
          successful: renderResult.renderSuccessful,
          blank_shell_risk: renderResult.blankShellRisk,
          hydration_detected: renderResult.hydrationDetected,
          client_only_content_detected:
            renderResult.clientOnlyContentDetected,
          content_delta_detected: renderResult.contentDeltaDetected,
          rendered_text_length: renderResult.renderedTextLength,
        }
      : null,

    meta: {
      preflight_ok: preflightSignals?.ok ?? false,
      schema_validated: schema !== null,
      crawlability_audited: crawl !== null,
      entity_checked: entity !== null,
      readable_content_extracted: readable !== null,
      ingest_present: intelligenceIngest !== null,
      render_attempted: renderResult?.renderAttempted === true,
    },
  };
}
