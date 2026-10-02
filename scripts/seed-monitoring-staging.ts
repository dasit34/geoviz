/* eslint-disable no-console */
/**
 * Seed ONE demo monitoring subscription on a NON-PRODUCTION database so the
 * dashboard can be exercised on a Vercel Preview. Strict guard — refuses
 * production, no override. Idempotent (fixed fake Stripe ids).
 *
 *   DATABASE_URL=<staging> GEOVIZ_NONPROD_DB_HOSTS=<host> npx tsx scripts/seed-monitoring-staging.ts \
 *     --website https://example-roofer.com --name "Example Roofing" --email you@example.com \
 *     [--competitor "Other Roofing|https://otherroofing.com"]... [--prompt "Who is the best roofer in X?"]...
 *
 * Creates no Stripe objects; the subscription is marked active with fake ids.
 */
import "./lib/require-nonprod-db";
import { randomBytes } from "node:crypto";

import { prisma } from "../src/lib/db";
import { normalizeDomain } from "../src/lib/business/normalize-domain";
import { addTrackedCompetitor, addTrackedPrompt } from "../src/lib/monitoring/tracking/service";

function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => { if (a === name && process.argv[i + 1]) out.push(process.argv[i + 1]!); });
  return out;
}

async function main(): Promise<void> {
  const website = args("--website")[0];
  const name = args("--name")[0];
  const email = args("--email")[0] ?? "staging-demo@example.invalid";
  if (!website || !name) throw new Error("--website and --name are required");
  const domain = normalizeDomain(website) ?? "demo";
  const stripeSubscriptionId = `sub_staging_demo_${domain.replace(/[^a-z0-9]/g, "_")}`;

  const sub = await prisma.monitoringSubscription.upsert({
    where: { stripeSubscriptionId },
    create: {
      accessToken: randomBytes(32).toString("base64url"),
      planKey: "monthly",
      stripePriceId: "price_staging_demo",
      stripeSubscriptionId,
      stripeCustomerId: null,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      websiteUrl: website,
      businessName: name,
      email,
      cadenceDays: 30,
      nextAuditAt: null,
    },
    update: { status: "active", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
  });

  for (const p of args("--prompt")) {
    const r = await addTrackedPrompt(sub, p, "custom");
    console.log(`  prompt "${p}": ${r.ok ? "ok" : r.message}`);
  }
  for (const c of args("--competitor")) {
    const [cname, curl] = c.split("|");
    const r = await addTrackedCompetitor(sub, cname ?? "", curl ?? null, "customer");
    console.log(`  competitor "${cname}": ${r.ok ? "ok" : r.message}`);
  }
  console.log(`[seed-monitoring-staging] subscription=${sub.id}`);
  console.log(`[seed-monitoring-staging] dashboard path: /monitoring/${sub.accessToken}`);
}

main()
  .catch((err) => {
    console.error("[seed-monitoring-staging] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
