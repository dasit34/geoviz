/* eslint-disable no-console */
/**
 * scripts/test-competitive-metrics.ts
 *
 * Unit tests for `src/lib/intelligence/competitive/*` — Intelligence
 * Engine Phase 1's win-loss / share-of-voice / mention-rate formulas.
 * No network, no real DB writes: a small in-memory fake Prisma client
 * implements just the query shapes these modules actually issue, so
 * every assertion is hand-verifiable against the seeded fixture rows
 * (mirrors the plan's "hand-verify a ShareOfVoice/competitorFrequency
 * result against a raw SQL query" verification step, in unit-test
 * form).
 *
 *   npx tsx scripts/test-competitive-metrics.ts
 *
 * Exit code 0 if all assertions pass; 1 otherwise.
 */
import { mentionRate } from "../src/lib/intelligence/competitive/mentionRate";
import { recommendationRate } from "../src/lib/intelligence/competitive/recommendationRate";
import { shareOfVoice } from "../src/lib/intelligence/competitive/shareOfVoice";
import { competitorFrequency } from "../src/lib/intelligence/competitive/competitorFrequency";
import { queryWinLoss } from "../src/lib/intelligence/competitive/queryWinLoss";
import { modelWinLoss } from "../src/lib/intelligence/competitive/modelWinLoss";

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

// ─── Fixture rows (denormalized, as if read from the DB) ──────────

type ObsRow = {
  id: string;
  businessId: string | null;
  queryLibraryEntryId: string | null;
  callType: string;
  provider: string;
  mentioned: boolean | null;
  recommended: boolean | null;
  observedAt: Date;
  industryNormalized: string;
  geographyRaw: string;
};

type MentionRow = {
  observationId: string;
  competitorName: string;
  competitorNormalized: string;
};

type BusinessRow = {
  id: string;
  normalizedDomain: string;
  primaryWebsiteUrl: string | null;
};

const observations: ObsRow[] = [
  // Acme (biz_acme) — 3 competitive_capture observations across
  // providers, 2 mentioned=true, 1 mentioned=false.
  { id: "o1", businessId: "biz_acme", queryLibraryEntryId: "q1", callType: "competitive_capture", provider: "claude", mentioned: true, recommended: null, observedAt: new Date("2026-08-01"), industryNormalized: "roofing", geographyRaw: "austin, tx" },
  { id: "o2", businessId: "biz_acme", queryLibraryEntryId: "q1", callType: "competitive_capture", provider: "openai", mentioned: true, recommended: null, observedAt: new Date("2026-08-02"), industryNormalized: "roofing", geographyRaw: "austin, tx" },
  { id: "o3", businessId: "biz_acme", queryLibraryEntryId: "q1", callType: "competitive_capture", provider: "gemini", mentioned: false, recommended: null, observedAt: new Date("2026-08-03"), industryNormalized: "roofing", geographyRaw: "austin, tx" },
  // Acme — self_assessment observations, 2 recommended=true, 1 recommended=false.
  { id: "o4", businessId: "biz_acme", queryLibraryEntryId: null, callType: "self_assessment", provider: "claude", mentioned: null, recommended: true, observedAt: new Date("2026-08-01"), industryNormalized: "roofing", geographyRaw: "austin, tx" },
  { id: "o5", businessId: "biz_acme", queryLibraryEntryId: null, callType: "self_assessment", provider: "openai", mentioned: null, recommended: true, observedAt: new Date("2026-08-02"), industryNormalized: "roofing", geographyRaw: "austin, tx" },
  { id: "o6", businessId: "biz_acme", queryLibraryEntryId: null, callType: "self_assessment", provider: "gemini", mentioned: null, recommended: false, observedAt: new Date("2026-08-03"), industryNormalized: "roofing", geographyRaw: "austin, tx" },
  // A re-run for claude/q1 — MORE RECENT than o1, mentioned flips to false.
  // Must be the one queryWinLoss/modelWinLoss pick as "latest" for claude.
  { id: "o7", businessId: "biz_acme", queryLibraryEntryId: "q1", callType: "competitive_capture", provider: "claude", mentioned: false, recommended: null, observedAt: new Date("2026-08-10"), industryNormalized: "roofing", geographyRaw: "austin, tx" },
  // A different business (biz_other) in the SAME industry/geo — only
  // named as a competitor, never a subject-mention row of its own here.
];

const competitorMentions: MentionRow[] = [
  // From o1 (Acme's own competitive_capture row): 2 competitors named.
  { observationId: "o1", competitorName: "Bob's Roofing", competitorNormalized: "bob's roofing" },
  { observationId: "o1", competitorName: "Roofing Experts", competitorNormalized: "roofing experts" },
  // From o2: same two competitors named again (repeat mention).
  { observationId: "o2", competitorName: "Bob's Roofing", competitorNormalized: "bob's roofing" },
  { observationId: "o2", competitorName: "Roofing Experts", competitorNormalized: "roofing experts" },
  // From o7 (the re-run): only Bob's Roofing named.
  { observationId: "o7", competitorName: "Bob's Roofing", competitorNormalized: "bob's roofing" },
];

const businesses: BusinessRow[] = [
  { id: "biz_acme", normalizedDomain: "acme-roofing.com", primaryWebsiteUrl: "https://acme-roofing.com" },
];

function observationMatchesScope(
  o: ObsRow,
  scope: { industryNormalized?: string; geographyRaw?: string },
): boolean {
  if (scope.industryNormalized && o.industryNormalized !== scope.industryNormalized) return false;
  if (scope.geographyRaw && o.geographyRaw !== scope.geographyRaw) return false;
  return true;
}

function createFakePrisma() {
  const db = {
    observation: {
      findMany: async ({ where, orderBy }: any) => {
        let rows = observations.filter((o) => {
          if (typeof where.businessId === "string" && where.businessId !== o.businessId) return false;
          if (
            where.businessId &&
            typeof where.businessId === "object" &&
            where.businessId.not === null &&
            o.businessId === null
          ) {
            return false;
          }
          if (where.queryLibraryEntryId && where.queryLibraryEntryId !== o.queryLibraryEntryId) return false;
          if (where.callType && where.callType !== o.callType) return false;
          if (where.mentioned === true && o.mentioned !== true) return false;
          if (where.mentioned?.not === null && o.mentioned === null) return false;
          if (where.recommended?.not === null && o.recommended === null) return false;
          if (where.queryLibraryEntry && !observationMatchesScope(o, where.queryLibraryEntry)) return false;
          return true;
        });
        if (orderBy?.observedAt === "desc") {
          rows = [...rows].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
        }
        return rows;
      },
    },
    observationCompetitorMention: {
      findMany: async ({ where }: any) => {
        const obsWhere = where.observation ?? {};
        const matchingObsIds = new Set(
          observations
            .filter((o) => {
              if (obsWhere.callType && obsWhere.callType !== o.callType) return false;
              if (obsWhere.queryLibraryEntry && !observationMatchesScope(o, obsWhere.queryLibraryEntry)) return false;
              return true;
            })
            .map((o) => o.id),
        );
        return competitorMentions.filter((m) => matchingObsIds.has(m.observationId));
      },
    },
    business: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where.id.in;
        return businesses.filter((b) => ids.includes(b.id));
      },
    },
  };
  return db as never;
}

async function run(): Promise<void> {
  const db = createFakePrisma();
  console.log("=== test-competitive-metrics ===\n");

  {
    console.log("mentionRate");
    const result = await mentionRate({ prisma: db, businessId: "biz_acme" });
    // 4 competitive_capture rows for biz_acme (o1,o2,o3,o7): mentioned = true,true,false,false
    assert(result.totalObservations === 4, `totalObservations === 4 (got ${result.totalObservations})`);
    assert(result.mentionedCount === 2, `mentionedCount === 2 (got ${result.mentionedCount})`);
    assert(result.rate === 0.5, `rate === 0.5 (got ${result.rate})`);
    console.log("");
  }

  {
    console.log("recommendationRate");
    const result = await recommendationRate({ prisma: db, businessId: "biz_acme" });
    // 3 self_assessment rows: recommended = true,true,false
    assert(result.totalObservations === 3, `totalObservations === 3 (got ${result.totalObservations})`);
    assert(result.recommendedCount === 2, `recommendedCount === 2 (got ${result.recommendedCount})`);
    assert(Math.abs((result.rate ?? 0) - 2 / 3) < 1e-9, `rate === 2/3 (got ${result.rate})`);
    console.log("");
  }

  {
    console.log("shareOfVoice");
    const result = await shareOfVoice({
      prisma: db,
      industryNormalized: "roofing",
      geographyRaw: "austin, tx",
    });
    // Subject mentions (mentioned=true, competitive_capture, in scope): o1, o2 → biz_acme count = 2
    // Competitor mentions, scoped to competitive_capture rows in industry/geo
    // (o1, o2, o3, o7 all qualify by scope+callType — mention filter does NOT
    // apply to the competitor-mention query, only to the subject-mention query):
    //   from o1: bob's roofing, roofing experts
    //   from o2: bob's roofing, roofing experts
    //   from o7: bob's roofing
    // => bob's roofing = 3, roofing experts = 2
    // totalMentions = 2 (acme) + 3 (bob's) + 2 (experts) = 7
    assert(result.totalMentions === 7, `totalMentions === 7 (got ${result.totalMentions})`);
    const acme = result.entities.find((e) => e.isSubjectBusiness);
    assert(acme?.mentionCount === 2, `acme mentionCount === 2 (got ${acme?.mentionCount})`);
    assert(Math.abs((acme?.share ?? 0) - 2 / 7) < 1e-9, `acme share === 2/7 (got ${acme?.share})`);
    const bobs = result.entities.find((e) => e.entityNormalized === "bob's roofing");
    assert(bobs?.mentionCount === 3, `bob's roofing mentionCount === 3 (got ${bobs?.mentionCount})`);
    assert(result.entities[0]?.entityNormalized === "bob's roofing", "highest-mention entity (bob's roofing) sorts first");
    console.log("");
  }

  {
    console.log("competitorFrequency");
    const result = await competitorFrequency({
      prisma: db,
      industryNormalized: "roofing",
      geographyRaw: "austin, tx",
    });
    assert(result.length === 2, `2 distinct competitors (got ${result.length})`);
    assert(result[0]?.competitorNormalized === "bob's roofing" && result[0]?.mentionCount === 3, "bob's roofing ranked first with count 3");
    assert(result[1]?.competitorNormalized === "roofing experts" && result[1]?.mentionCount === 2, "roofing experts ranked second with count 2");
    console.log("");
  }

  {
    console.log("queryWinLoss");
    const result = await queryWinLoss({ prisma: db, businessId: "biz_acme", queryLibraryEntryId: "q1" });
    // Providers for q1: claude (o1 2026-08-01 mentioned=true, o7 2026-08-10 mentioned=false → latest is o7, LOSS),
    // openai (o2, mentioned=true → WIN), gemini (o3, mentioned=false → LOSS)
    assert(result.outcomes.length === 3, `3 providers observed (got ${result.outcomes.length})`);
    const claudeOutcome = result.outcomes.find((o) => o.provider === "claude");
    assert(claudeOutcome?.win === false, "claude's LATEST observation (o7, mentioned=false) is a loss, not o1's true");
    const openaiOutcome = result.outcomes.find((o) => o.provider === "openai");
    assert(openaiOutcome?.win === true, "openai win");
    assert(result.wins === 1 && result.losses === 2, `wins=1 losses=2 (got wins=${result.wins} losses=${result.losses})`);
    console.log("");
  }

  {
    console.log("modelWinLoss");
    const result = await modelWinLoss({ prisma: db, businessId: "biz_acme" });
    // Across ALL of biz_acme's observations, latest per provider:
    //   claude: max(o1 08-01, o4 08-01, o7 08-10) → o7 (mentioned=false) → LOSS
    //   openai: max(o2 08-02, o5 08-02) → tie, either mentioned=true or recommended=true → WIN either way
    //   gemini: max(o3 08-03, o6 08-03) → tie, mentioned=false / recommended=false → LOSS
    assert(result.outcomes.length === 3, `3 providers (got ${result.outcomes.length})`);
    const claudeOutcome = result.outcomes.find((o) => o.provider === "claude");
    assert(claudeOutcome?.win === false, "claude's latest overall observation (o7) is a loss");
    assert(result.wins + result.losses === 3, "wins+losses accounts for all 3 providers");
    console.log("");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
