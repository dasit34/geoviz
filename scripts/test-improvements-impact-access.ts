/* eslint-disable no-console */
/**
 * scripts/test-improvements-impact-access.ts — before/after measurement
 * around implementation (compatible pairs only, coverage, awaiting), no
 * causation language, and access control on every improvement surface.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { harness } from "./lib/monitoring-fakes";
import { buildImpact, IMPACT_DISCLAIMER } from "../src/lib/monitoring/improvements/impact";
import type { ResultForMetrics } from "../src/lib/monitoring/tracking/types";

const h = harness("improvements-impact-access");
const r = (prompt: string, provider: string, mentioned: boolean | null, fp = "fp1", status = "measured"): ResultForMetrics => ({
  trackedPromptId: prompt, provider, sampleIndex: 0, status, callState: "completed", mentioned, position: null, positionStatus: "no_ordered_list", configFingerprint: fp, citedDomains: [], namedBusinesses: [], competitorIdsMentioned: [], costUsd: 0,
});
const cyc = (id: string, at: string, results: ResultForMetrics[]) => ({ id, startedAt: new Date(at), results });

(async () => {
  console.log("[improvements-impact-access] running...");

  await h.check("not implemented → nothing; implemented with no later run → Awaiting next measurement", () => {
    assert.equal(buildImpact({ implementedAt: null, cycles: [], customerDomain: null, competitors: [] }).state, "not_implemented");
    const v = buildImpact({ implementedAt: new Date("2026-10-05"), cycles: [cyc("c1", "2026-10-01", [r("p", "openai", false)])], customerDomain: null, competitors: [] });
    assert.equal(v.state, "awaiting");
    assert.equal(v.state === "awaiting" && v.before?.measured, 1);
  });

  await h.check("picks the last run before and the first run after; reports coverage and comparable change", () => {
    const v = buildImpact({
      implementedAt: new Date("2026-10-05"),
      cycles: [
        cyc("old", "2026-09-01", [r("p", "openai", true)]),
        cyc("before", "2026-10-01", [r("p", "openai", false), r("p", "claude", false), r("p", "gemini", null, "fp1", "not_measured")]),
        cyc("after", "2026-10-10", [r("p", "openai", true), r("p", "claude", false)]),
        cyc("later", "2026-11-10", [r("p", "openai", true)]),
      ],
      customerDomain: null,
      competitors: [],
      trackedPromptId: "p",
    });
    assert.equal(v.state, "measured");
    if (v.state !== "measured") return;
    assert.equal(v.before?.cycleId, "before");
    assert.equal(v.after.cycleId, "after");
    assert.equal(v.before?.measured, 2);
    assert.equal(v.before?.answers, 3, "coverage keeps the not-measured sample in the denominator");
    assert.equal(v.comparable, true);
    assert.equal(v.mentionChange, 0.5);
    assert.deepEqual(v.question?.after, { named: 1, measured: 2 });
  });

  await h.check("configuration changes → not comparable, no delta shown", () => {
    const v = buildImpact({
      implementedAt: new Date("2026-10-05"),
      cycles: [cyc("b", "2026-10-01", [r("p", "openai", false, "v1")]), cyc("a", "2026-10-10", [r("p", "openai", true, "v2")])],
      customerDomain: null,
      competitors: [],
    });
    assert.ok(v.state === "measured" && !v.comparable && v.mentionChange === null);
  });

  await h.check("impact copy never claims causation", () => {
    assert.match(IMPACT_DISCLAIMER, /doesn't show that the change caused/);
    const ui = readFileSync("src/components/ImprovementsSection.tsx", "utf8");
    assert.doesNotMatch(ui.replace(IMPACT_DISCLAIMER, ""), /because of (your|this) (change|fix)|led to|improved your ranking|guarantee/i);
  });

  await h.check("customer routes: flag gate, rate limit, token lookup before any action", () => {
    for (const f of ["src/app/api/monitoring/improvements/route.ts", "src/app/api/monitoring/improvements/draft/route.ts"]) {
      const src = readFileSync(f, "utf8");
      assert.match(src, /isMonitoringEnabled\(\)/, f);
      assert.match(src, /applyApiRateLimit/, f);
      const tokenAt = src.indexOf("findSubscriptionByToken(");
      assert.ok(tokenAt > 0, f);
      for (const call of ["createTaskFromRecommendation(", "transitionTask(", "draftForDownload(", "saveFacts("]) {
        const at = src.indexOf(call, src.indexOf("export async function"));
        if (at > 0) assert.ok(at > tokenAt, `${f}: ${call} after token check`);
      }
    }
    const route = readFileSync("src/app/api/monitoring/improvements/route.ts", "utf8");
    assert.doesNotMatch(route, /to: "verified"/, "customers have no verify action");
  });

  await h.check("draft download is an attachment served as plain text (never rendered)", () => {
    const src = readFileSync("src/app/api/monitoring/improvements/draft/route.ts", "utf8");
    assert.match(src, /Content-Disposition": `attachment/);
    assert.match(src, /text\/plain/);
    assert.match(src, /nosniff/);
  });

  await h.check("admin route + page require the existing admin session or ADMIN_SECRET", () => {
    const route = readFileSync("src/app/api/admin/improvements/route.ts", "utf8");
    assert.match(route, /if \(!isAuthed\(\) && !isValidAdminKey\(key\)\) return/);
    assert.ok(route.indexOf("isValidAdminKey(key)") < route.indexOf("monitoringSubscription.findUnique"));
    const page = readFileSync("src/app/admin/improvements/page.tsx", "utf8");
    assert.match(page, /if \(!isAdminPageRequest\(\{ key: searchParams\?\.key \}\)\) notFound\(\)/);
  });

  await h.check("service scopes every task/draft query by subscription and gates customer writes", () => {
    const svc = readFileSync("src/lib/monitoring/improvements/service.ts", "utf8");
    assert.match(svc, /findFirst\(\{ where: \{ id: taskId, subscriptionId \} \}\)/);
    assert.match(svc, /improvementDraft\.findFirst\(\{ where: \{ id: draftId, task: \{ subscriptionId \} \}/);
    assert.match(svc, /updateMany\(\{ where: \{ id: task\.id, subscriptionId: sub\.id, status: from \}/);
    const writes = ["saveFacts", "createTaskFromRecommendation", "transitionTask", "addTaskNote", "regenerateDraft"];
    for (const w of writes) assert.match(svc, new RegExp(`export async function ${w}[\\s\\S]{0,300}?canEditTracking\\(sub\\)`), w);
    assert.match(svc, /const rec = recommendations\.find\(\(r\) => r\.id === recommendationId\)/, "recommendations recomputed server-side");
  });

  h.done();
})();
