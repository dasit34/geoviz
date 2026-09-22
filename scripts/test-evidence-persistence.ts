/* eslint-disable no-console */
/**
 * scripts/test-evidence-persistence.ts
 *
 * Unit test for `persistObservationEvidence` — Intelligence Engine
 * Phase 1's evidence write path. No network, no real DB writes: the
 * Prisma client is a hand-rolled in-memory fake implementing only
 * the methods the module actually calls, so this exercises the pure
 * normalization/branching logic in isolation.
 *
 *   npx tsx scripts/test-evidence-persistence.ts
 *
 * Exit code 0 if all assertions pass; 1 otherwise.
 */
import { persistObservationEvidence } from "../src/lib/intelligence/evidence/persistObservationEvidence";
import type {
  NormalizedValidationOutput,
  ValidationLayerResult,
} from "../src/lib/validators/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL: ${message}`);
  }
}

// ─── In-memory fake Prisma client ──────────────────────────────────

type FakeObservationRow = Record<string, unknown> & { id: string };
type FakeQueryLibraryRow = Record<string, unknown> & { id: string };
type FakeCompetitorMentionRow = Record<string, unknown> & { id: string };

function createFakePrisma(opts: { businessId: string | null }) {
  let nextId = 1;
  const observations: FakeObservationRow[] = [];
  const queryLibraryEntries: FakeQueryLibraryRow[] = [];
  const competitorMentions: FakeCompetitorMentionRow[] = [];

  const db = {
    auditOrder: {
      findUnique: async () => ({ businessId: opts.businessId }),
    },
    observation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeObservationRow = { id: `obs_${nextId++}`, ...data };
        observations.push(row);
        return { id: row.id };
      },
    },
    queryLibraryEntry: {
      upsert: async ({
        where,
        create,
      }: {
        where: {
          normalizedQueryText_industryNormalized_geographyRaw: {
            normalizedQueryText: string;
            industryNormalized: string;
            geographyRaw: string;
          };
        };
        create: Record<string, unknown>;
      }) => {
        const key = where.normalizedQueryText_industryNormalized_geographyRaw;
        const existing = queryLibraryEntries.find(
          (e) =>
            e.normalizedQueryText === key.normalizedQueryText &&
            e.industryNormalized === key.industryNormalized &&
            e.geographyRaw === key.geographyRaw,
        );
        if (existing) return { id: existing.id };
        const row: FakeQueryLibraryRow = { id: `qle_${nextId++}`, ...create };
        queryLibraryEntries.push(row);
        return { id: row.id };
      },
    },
    observationCompetitorMention: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeCompetitorMentionRow = {
          id: `ocm_${nextId++}`,
          ...data,
        };
        competitorMentions.push(row);
        return { id: row.id };
      },
    },
  };

  return { db, observations, queryLibraryEntries, competitorMentions };
}

function makeOutput(
  overrides: Partial<NormalizedValidationOutput>,
): NormalizedValidationOutput {
  return {
    provider: "claude",
    status: "passed",
    business_understanding_score: 80,
    category_confidence: "high",
    service_area_confidence: "high",
    recommendation_confidence: "high",
    missing_facts: [],
    cited_sources: [],
    raw_summary: "summary",
    error: null,
    prompt_text: "system\n\nuser",
    raw_response_text: '{"would_recommend":"YES"}',
    model: "claude-haiku-4-5-20251001",
    model_version: "2026-01-01",
    prompt_version: "capture@1.0.0",
    would_recommend: "YES",
    answer_retrieved_at: "2026-08-12T00:00:00.000Z",
    cited_source_domains: ["example.com"],
    execution_mode: "live",
    country: null,
    search_region: null,
    ...overrides,
  };
}

async function run(): Promise<void> {
  console.log("=== test-evidence-persistence ===\n");

  // Scenario 1: self_assessment only, no competitive capture.
  {
    console.log("Scenario 1: self_assessment only");
    const { db, observations } = createFakePrisma({ businessId: "biz_1" });
    const validatorResult: ValidationLayerResult = {
      outputs: [makeOutput({ competitive: null })],
      ran_at: new Date().toISOString(),
      capture_version: "capture@1.0.0",
    };
    const result = await persistObservationEvidence({
      prisma: db as never,
      orderId: "order_1",
      businessName: "Acme Roofing",
      websiteUrl: "https://acme-roofing.com",
      industryRaw: "roofer",
      validatorResult,
    });
    assert(result.observationsWritten === 1, "writes exactly 1 observation");
    assert(
      result.queryEntriesTouched === 0,
      "touches 0 query library entries (no competitive capture)",
    );
    assert(
      observations[0]?.callType === "self_assessment",
      "observation callType is self_assessment",
    );
    assert(
      observations[0]?.recommended === true,
      "would_recommend YES maps to recommended=true",
    );
    assert(
      observations[0]?.mentioned === null,
      "self_assessment mentioned is always null",
    );
    assert(
      observations[0]?.businessId === "biz_1",
      "businessId denormalized from AuditOrder lookup",
    );
    assert(
      observations[0]?.executionMode === "live",
      "self_assessment executionMode carried through from output.execution_mode",
    );
    assert(
      observations[0]?.country === null && observations[0]?.searchRegion === null,
      "self_assessment country/searchRegion are null (reserved, not yet populated)",
    );
    console.log("");
  }

  // Scenario 2: self_assessment + competitive_capture, with a
  // subject-name entity filtered out of competitor mentions.
  {
    console.log("Scenario 2: self_assessment + competitive_capture");
    const { db, observations, queryLibraryEntries, competitorMentions } =
      createFakePrisma({ businessId: "biz_2" });
    const validatorResult: ValidationLayerResult = {
      outputs: [
        makeOutput({
          would_recommend: "NO",
          competitive: {
            query_text: "the full per-business prompt (not reused)",
            prompt_version: "capture@1.0.0",
            raw_response: "I'd recommend Acme Roofing and Bob's Roofing.",
            inferred_category: "roofing",
            inferred_location: "Austin, TX",
            entities: ["Acme Roofing", "Bob's Roofing", "Roofing Experts"],
            business_named: true,
            model: "claude-haiku-4-5-20251001",
            model_version: "2026-01-01",
            retrieved_at: "2026-08-12T00:00:00.000Z",
            status: "passed",
            error: null,
            execution_mode: "live",
            country: null,
            search_region: null,
          },
        }),
      ],
      ran_at: new Date().toISOString(),
      capture_version: "capture@1.0.0",
    };
    const result = await persistObservationEvidence({
      prisma: db as never,
      orderId: "order_2",
      businessName: "Acme Roofing",
      websiteUrl: "https://acme-roofing.com",
      industryRaw: "roofer",
      validatorResult,
    });
    assert(
      result.observationsWritten === 2,
      "writes 2 observations (self_assessment + competitive_capture)",
    );
    assert(result.queryEntriesTouched === 1, "touches exactly 1 query entry");
    assert(
      queryLibraryEntries.length === 1,
      "creates exactly 1 QueryLibraryEntry row",
    );
    assert(
      queryLibraryEntries[0]?.queryText ===
        "Who are the best providers in this category and area, and would you recommend any in particular?",
      "QueryLibraryEntry.queryText is the reusable DISCOVERY_QUERY_TEXT, not the full per-business prompt",
    );
    assert(
      queryLibraryEntries[0]?.industryNormalized === "roofing",
      "industryNormalized derived from audit-level industryRaw via the frozen taxonomy",
    );
    assert(
      queryLibraryEntries[0]?.geographyRaw === "austin, tx",
      "geographyRaw derived from the provider's inferred_location, lowercased",
    );
    const competitiveObs = observations.find(
      (o) => o.callType === "competitive_capture",
    );
    assert(
      competitiveObs?.mentioned === true,
      "competitive_capture mentioned = business_named",
    );
    assert(
      competitiveObs?.recommended === null,
      "competitive_capture recommended is always null",
    );
    assert(
      competitiveObs?.executionMode === "live",
      "competitive_capture executionMode carried through from competitive.execution_mode",
    );
    assert(
      competitiveObs?.country === null && competitiveObs?.searchRegion === null,
      "competitive_capture country/searchRegion are null (reserved, not yet populated)",
    );
    assert(
      competitiveObs?.queryLibraryEntryId === queryLibraryEntries[0]?.id,
      "competitive_capture observation links to the QueryLibraryEntry",
    );
    assert(
      competitorMentions.length === 2,
      "writes 2 competitor mentions (subject business name filtered out of 3 entities)",
    );
    assert(
      !competitorMentions.some((m) => m.competitorName === "Acme Roofing"),
      "subject business is excluded from competitor mentions",
    );
    assert(
      competitorMentions.some((m) => m.competitorName === "Bob's Roofing"),
      "real competitor is included",
    );
    console.log("");
  }

  // Scenario 3: dedup — two audits in the same industry+geo must
  // upsert into the SAME QueryLibraryEntry, not create two.
  {
    console.log("Scenario 3: QueryLibraryEntry dedup across audits");
    const { db, queryLibraryEntries } = createFakePrisma({
      businessId: null,
    });
    const makeCompetitiveResult = (): ValidationLayerResult => ({
      outputs: [
        makeOutput({
          competitive: {
            query_text: "irrelevant per-business text",
            prompt_version: "capture@1.0.0",
            raw_response: "some answer",
            inferred_category: "hvac",
            inferred_location: "Denver, CO",
            entities: ["Some Other HVAC Co"],
            business_named: false,
            model: "claude-haiku-4-5-20251001",
            model_version: null,
            retrieved_at: "2026-08-12T00:00:00.000Z",
            status: "passed",
            error: null,
            execution_mode: "live",
            country: null,
            search_region: null,
          },
        }),
      ],
      ran_at: new Date().toISOString(),
      capture_version: "capture@1.0.0",
    });

    await persistObservationEvidence({
      prisma: db as never,
      orderId: "order_3a",
      businessName: "First HVAC Co",
      websiteUrl: "https://first-hvac.com",
      industryRaw: "HVAC contractor",
      validatorResult: makeCompetitiveResult(),
    });
    await persistObservationEvidence({
      prisma: db as never,
      orderId: "order_3b",
      businessName: "Second HVAC Co",
      websiteUrl: "https://second-hvac.com",
      industryRaw: "heating and cooling",
      validatorResult: makeCompetitiveResult(),
    });

    assert(
      queryLibraryEntries.length === 1,
      `exactly 1 QueryLibraryEntry created across 2 audits in the same industry+geo (got ${queryLibraryEntries.length})`,
    );
    console.log("");
  }

  // Scenario 4: unavailable/failed provider outputs are skipped
  // entirely (mirrors the write path's status === "passed" guard).
  {
    console.log("Scenario 4: non-passed status is skipped");
    const { db, observations } = createFakePrisma({ businessId: "biz_4" });
    const validatorResult: ValidationLayerResult = {
      outputs: [
        makeOutput({ status: "unavailable", competitive: null }),
        makeOutput({ status: "failed", competitive: null }),
      ],
      ran_at: new Date().toISOString(),
    };
    const result = await persistObservationEvidence({
      prisma: db as never,
      orderId: "order_4",
      businessName: "Acme Roofing",
      websiteUrl: "https://acme-roofing.com",
      industryRaw: "roofer",
      validatorResult,
    });
    assert(
      result.observationsWritten === 0,
      "writes 0 observations for unavailable/failed providers",
    );
    assert(observations.length === 0, "no rows created");
    console.log("");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
