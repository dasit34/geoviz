/* eslint-disable no-console */
/**
 * Proof Engine staging tool for the GeoViz internal case — NON-PRODUCTION ONLY
 * (strict guard, no override). Makes NO provider calls: run the baseline with
 * the existing `npm run monitoring:run-cycle -- --subscription <id>` (paid API
 * calls, staging only) after activating a set.
 *
 *   npx tsx scripts/proof-geoviz-staging.ts --subscription <id>
 *     [--propose]                          new draft from the GeoViz case context
 *     [--approve <setId>] [--activate <setId>]
 *     [--create-experiment <taskId>]       from an approved improvement task
 *     [--assess <experimentId>]
 *   (no flags = print the subscription's proof dashboard)
 */
import "./lib/require-nonprod-db";
import { GEOVIZ_CASE as C } from "./proof-geoviz-case";
import { prisma } from "../src/lib/db";
import { prismaProofStores as S } from "../src/lib/monitoring/proof/prisma-store";
import { ownerSummaryText } from "../src/lib/monitoring/proof/owner-summary";
import { activateSet, approveSet, assessAndRecord, createExperiment, loadProofDashboard, proposeDraft } from "../src/lib/monitoring/proof/service";

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };

async function main() {
  const id = arg("--subscription");
  if (!id) throw new Error("--subscription <id> is required.");
  const sub = await prisma.monitoringSubscription.findUnique({ where: { id }, select: { id: true, websiteUrl: true, businessName: true } });
  if (!sub) throw new Error("Subscription not found.");
  const now = new Date();
  const show = (label: string, r: { ok: boolean; reason?: string }) => console.log(`${label}: ${r.ok ? "ok" : `refused — ${r.reason}`}`);

  if (argv.includes("--propose")) {
    const r = await proposeDraft(S, sub, { ...C.context, services: [...C.context.services], competitorNames: [...C.context.competitorNames] }, now);
    show("propose", r);
    if (r.ok) console.log(`  draft v${r.value.version} ${r.value.id} (${r.value.items.length} questions)`);
  }
  const approve = arg("--approve"); if (approve) show("approve", await approveSet(S, sub, approve, "operator", now));
  const activate = arg("--activate"); if (activate) show("activate", await activateSet(S, sub, activate, now));
  const task = arg("--create-experiment");
  if (task) show("create experiment", await createExperiment(S, sub, { taskId: task, expectedCategory: C.experiment.expectedCategory }, now));
  const assess = arg("--assess"); if (assess) show("assess", await assessAndRecord(S, sub, assess, now));

  const d = await loadProofDashboard(S, sub, { now, recommendations: [] });
  console.log(`\nSets: ${d.questionSets.map((s) => `v${s.version} ${s.status} ${s.id}`).join(" · ") || "none"}`);
  console.log(`Experiments: ${d.experiments.map((v) => `${v.experimentId} ${v.outcome.state}`).join(" · ") || "none"}`);
  console.log(`\n${ownerSummaryText(d.summary)}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
