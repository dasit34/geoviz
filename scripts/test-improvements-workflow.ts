/* eslint-disable no-console */
/** scripts/test-improvements-workflow.ts — status machine, actor rules, dedupe/recurrence. */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import type { Recommendation } from "../src/lib/monitoring/tracking/recommendations";
import { canTransition, decideCreate, fixKindFor, seedFromRecommendation, TASK_STATUSES, type Actor, type TaskStatus } from "../src/lib/monitoring/improvements/workflow";

const h = harness("improvements-workflow");
const rec: Recommendation = { id: "website:lost_local_business_schema:a.example", category: "structured_data", priority: 1, title: "LocalBusiness schema missing", action: "Restore it", evidence: "On 2026-10-02 … no LocalBusiness", source: "website", url: "https://a.example/" };
const T = new Date("2026-10-02T00:00:00Z");

(async () => {
  console.log("[improvements-workflow] running...");

  await h.check("allowed transitions follow the documented machine", () => {
    const ok: Array<[TaskStatus, TaskStatus, Actor]> = [
      ["suggested", "approved", "customer"], ["suggested", "dismissed", "customer"], ["approved", "in_progress", "customer"], ["approved", "implemented", "customer"],
      ["in_progress", "implemented", "operator"], ["implemented", "in_progress", "customer"], ["implemented", "verified", "system"], ["dismissed", "suggested", "customer"],
    ];
    for (const [from, to, actor] of ok) assert.equal(canTransition({ from, to, actor, fixKind: "structured_data" }).ok, true, `${from}→${to} by ${actor}`);
  });

  await h.check("customers can never mark Verified; skipping steps is refused; verified is terminal", () => {
    for (const from of TASK_STATUSES) assert.equal(canTransition({ from, to: "verified", actor: "customer", fixKind: "citation" }).ok, false, from);
    assert.equal(canTransition({ from: "suggested", to: "implemented", actor: "customer", fixKind: "faq" }).ok, false);
    assert.equal(canTransition({ from: "in_progress", to: "verified", actor: "system", fixKind: "faq" }).ok, false, "must be implemented first");
    for (const to of TASK_STATUSES) if (to !== "implemented") assert.equal(canTransition({ from: "verified", to, actor: "operator", fixKind: "citation" }).ok, false, to);
  });

  await h.check("revoking a verification (verified → implemented) is operator-only", () => {
    assert.equal(canTransition({ from: "verified", to: "implemented", actor: "operator", fixKind: "faq" }).ok, true);
    assert.equal(canTransition({ from: "verified", to: "implemented", actor: "customer", fixKind: "faq" }).ok, false);
    assert.equal(canTransition({ from: "verified", to: "implemented", actor: "system", fixKind: "faq" }).ok, false);
  });

  await h.check("operators verify only kinds the scanner can't check", () => {
    assert.equal(canTransition({ from: "implemented", to: "verified", actor: "operator", fixKind: "citation" }).ok, true);
    assert.equal(canTransition({ from: "implemented", to: "verified", actor: "operator", fixKind: "general" }).ok, true);
    for (const k of ["structured_data", "title_description", "page_outline", "faq", "identity_checklist", "restore_page"] as const) {
      assert.equal(canTransition({ from: "implemented", to: "verified", actor: "operator", fixKind: k }).ok, false, k);
    }
  });

  await h.check("recommendation → fix kind + verification method", () => {
    assert.equal(fixKindFor("audit:schema.no_localbusiness"), "structured_data");
    assert.equal(fixKindFor("audit:content.no_faq"), "faq");
    assert.equal(fixKindFor("audit:trust.nap_inconsistent"), "identity_checklist");
    assert.equal(fixKindFor("audit:crawler.no_sitemap"), "general");
    assert.equal(fixKindFor("tracking:citation_gaps"), "citation");
    assert.equal(fixKindFor("website:page_removed:https://a.example/x"), "restore_page");
    assert.equal(fixKindFor("website:competitor_topic:b.example:heat pumps"), "page_outline");
    const s = seedFromRecommendation(rec, T);
    assert.equal(s.verificationMethod, "scanner");
    assert.equal(s.evidence[0]!.url, "https://a.example/");
    assert.equal(seedFromRecommendation({ ...rec, id: "tracking:citation_gaps", source: "tracking" }, T).verificationMethod, "manual");
  });

  await h.check("dedupe: an open task absorbs the recurring finding", () => {
    const d = decideCreate({ seed: seedFromRecommendation(rec, T), existing: [{ id: "t1", status: "in_progress", dismissedAt: null, lastSeenAt: T }], evidenceObservedAt: T });
    assert.equal(d.action, "recurrence");
  });

  await h.check("after verification, a recurring finding opens a NEW task (history kept)", () => {
    const d = decideCreate({ seed: seedFromRecommendation(rec, T), existing: [{ id: "t1", status: "verified", dismissedAt: null, lastSeenAt: new Date("2026-09-01") }], evidenceObservedAt: T });
    assert.equal(d.action, "create");
  });

  await h.check("a dismissed finding isn't re-created unless observed again after dismissal", () => {
    const dismissedAt = new Date("2026-10-05T00:00:00Z");
    const skip = decideCreate({ seed: seedFromRecommendation(rec, T), existing: [{ id: "t1", status: "dismissed", dismissedAt, lastSeenAt: T }], evidenceObservedAt: new Date("2026-10-04") });
    assert.equal(skip.action, "skip");
    const again = decideCreate({ seed: seedFromRecommendation(rec, T), existing: [{ id: "t1", status: "dismissed", dismissedAt, lastSeenAt: T }], evidenceObservedAt: new Date("2026-10-06") });
    assert.equal(again.action, "create");
  });

  h.done();
})();
