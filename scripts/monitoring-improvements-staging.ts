/* eslint-disable no-console */
/**
 * Staging operator tool for improvement workflows — NON-PRODUCTION ONLY
 * (strict guard, no override).
 *
 *   npx tsx scripts/monitoring-improvements-staging.ts --subscription <id>
 *     [--confirm-facts '<json of fact fields>']   operator-confirmed facts (new version)
 *     [--create <recommendationId>]              repeatable; recomputed server-side
 *     [--implement <taskId> [--url <page>]]       operator marks implemented (queues a check)
 *     [--run-checks]                              run queued REAL scanner checks for this subscription
 *     [--fixture-demo]                            FIXTURE: fake site served from memory (isFixture=true)
 *
 * Never edits a website, sends email, or touches Stripe.
 */
import "./lib/require-nonprod-db";

import { fakeSite, html, type FakeRoute } from "./lib/website-fakes";
import { prisma } from "../src/lib/db";
import { generateDraft, GENERATOR_VERSION } from "../src/lib/monitoring/improvements/drafts";
import { EMPTY_FACTS } from "../src/lib/monitoring/improvements/facts";
import { prismaVerificationStore } from "../src/lib/monitoring/improvements/prisma-store";
import { createTaskFromRecommendation, saveFacts, transitionTask } from "../src/lib/monitoring/improvements/service";
import { runQueuedVerifications } from "../src/lib/monitoring/improvements/verify";
import type { FixKind } from "../src/lib/monitoring/improvements/workflow";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const args = (n: string) => process.argv.flatMap((a, i) => (a === n && process.argv[i + 1] ? [process.argv[i + 1]!] : []));

const FIXTURE_SITE: Record<string, FakeRoute> = {
  "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\n" },
  "/": {
    status: 200,
    body: html({ title: "Fixture HVAC | Furnace Repair in Columbus", h1: "Fixture HVAC", paragraphs: ["Heating and cooling for Columbus homes."], jsonLd: { "@context": "https://schema.org", "@type": "HVACBusiness", name: "Fixture HVAC", telephone: "(614) 555-0199" } }),
  },
  "/services/heat-pumps": { status: 200, body: html({ title: "Heat Pump Installation", h1: "Heat Pump Installation in Columbus", paragraphs: ["Cold-climate heat pumps installed and serviced."] }) },
  "/faq": { status: 403 },
};

async function fixtureDemo(subscriptionId: string) {
  const facts = { ...EMPTY_FACTS, name: "Fixture HVAC", phone: "(614) 555-0199", city: "Columbus", region: "OH", services: ["Heat Pump Installation"], serviceAreas: ["Columbus"] };
  const cases: Array<{ key: string; kind: FixKind; title: string; url: string | null; implUrl: string | null }> = [
    { key: "fixture:structured_data", kind: "structured_data", title: "FIXTURE: Add LocalBusiness structured data", url: null, implUrl: null },
    { key: "fixture:page_outline", kind: "page_outline", title: "FIXTURE: Add a page for a confirmed service", url: null, implUrl: "https://fixture-hvac.example/services/furnace-repair" },
    { key: "fixture:faq", kind: "faq", title: "FIXTURE: Add an FAQ section", url: null, implUrl: "https://fixture-hvac.example/faq" },
  ];
  for (const c of cases) {
    const draft = generateDraft({ fixKind: c.kind, dedupeKey: c.key, taskUrl: c.url, siteUrl: "https://fixture-hvac.example/", facts, industrySlug: "hvac", trackedQuestions: [], citationSources: [], observed: null });
    const expectation = c.kind === "page_outline" ? { type: "page_with_keyword", keyword: "Furnace Repair" } : draft.expectation;
    const existing = await prisma.improvementTask.findFirst({ where: { subscriptionId, dedupeKey: c.key } });
    if (existing) continue;
    const now = new Date();
    const t = await prisma.improvementTask.create({
      data: {
        subscriptionId, dedupeKey: c.key, openKey: null, source: "website", category: "website_content", fixKind: c.kind, isFixture: true,
        title: c.title, problem: c.title, evidence: [{ text: "FIXTURE (demonstration data) — fake site fixture-hvac.example served from memory.", observedAt: now.toISOString() }],
        url: c.url, priority: 2, priorityReason: "Demonstration of the verification states.", proposedFix: "Demonstration task.", owner: "operator",
        status: "implemented", verificationMethod: "scanner", expectation: expectation as object, implementationUrl: c.implUrl, approvedAt: now, implementedAt: now, implementedBy: "operator",
        drafts: { create: { version: 1, kind: draft.kind, format: draft.format, content: draft.content, missingFacts: draft.missingFacts, generatorVersion: GENERATOR_VERSION, createdBy: "system" } },
        events: { create: [{ actor: "operator", type: "created", toStatus: "suggested", note: "FIXTURE demonstration task" }, { actor: "operator", type: "status_changed", fromStatus: "approved", toStatus: "implemented" }] },
      },
    });
    const checkUrl = c.kind === "structured_data" ? "https://fixture-hvac.example/" : c.implUrl!;
    await prisma.improvementVerification.create({ data: { taskId: t.id, subscriptionId, url: checkUrl, expected: expectation as object, isFixture: true } });
  }
  // Fixture checks never retry into the future: a 403 is terminal ("could not verify").
  const r = await runQueuedVerifications({ store: prismaVerificationStore, now: () => new Date(), maxChecks: 10, subscriptionId, fixtures: true, deps: () => ({ fetcher: fakeSite(FIXTURE_SITE).fetcher, sleep: async () => {} }) });
  console.log(`[improvements-staging] FIXTURE checks: ${JSON.stringify(r.outcomes.map((o) => [o.outcome, o.fetchStatus]))}`);
}

async function main(): Promise<void> {
  const id = arg("--subscription");
  if (!id) throw new Error("--subscription <id> is required");
  const sub = await prisma.monitoringSubscription.findUnique({ where: { id } });
  if (!sub) throw new Error(`no MonitoringSubscription ${id}`);

  const factsJson = arg("--confirm-facts");
  if (factsJson) {
    const r = await saveFacts(sub, JSON.parse(factsJson) as Record<string, string>, "operator");
    console.log(`[improvements-staging] facts: ${JSON.stringify(r)}`);
  }
  for (const rec of args("--create")) {
    console.log(`[improvements-staging] create ${rec}: ${JSON.stringify(await createTaskFromRecommendation(sub, rec, "operator"))}`);
  }
  const impl = arg("--implement");
  if (impl) {
    await transitionTask(sub, { taskId: impl, to: "approved" }, "operator");
    console.log(`[improvements-staging] implement ${impl}: ${JSON.stringify(await transitionTask(sub, { taskId: impl, to: "implemented", implementationUrl: arg("--url"), notes: "Operator staging check" }, "operator"))}`);
  }
  if (process.argv.includes("--run-checks")) {
    const r = await runQueuedVerifications({ store: prismaVerificationStore, now: () => new Date(), maxChecks: 10, subscriptionId: id });
    console.log(`[improvements-staging] checks: ${JSON.stringify(r)}`);
  }
  if (process.argv.includes("--fixture-demo")) await fixtureDemo(id);
}

main()
  .catch((err) => {
    console.error("[improvements-staging] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
