/* eslint-disable no-console */
/** Proof Engine — question-set proposal, versioning and immutability (DB-free). */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { makeProofFakes } from "./lib/proof-fakes";
import { decideApprove, decideEditItems, FROZEN_MESSAGE, MAX_QUESTIONS_PER_SET, proposeQuestionSet, QUESTION_INTENTS } from "../src/lib/monitoring/proof/question-set";
import { activateSet, approveSet, editDraft, newVersionFrom, proposeDraft } from "../src/lib/monitoring/proof/service";

let passed = 0, failed = 0;
async function check(label: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✓ ${label}`); } catch (e) { failed += 1; console.log(`  ✗ ${label} — ${(e as Error).message}`); }
}
const T = new Date("2026-10-07T12:00:00Z");
const SUB = { id: "sub_a", websiteUrl: "https://www.example-roofing.com", businessName: "Example Roofing" };
const LOCAL = { businessName: "Example Roofing", businessCategory: "roofing contractor", categoryPlural: "roofing contractors", services: ["Roof repair", "Gutter installation"], city: "Toledo", state: "OH", isLocal: true, competitorNames: ["Rival Roofing"] };

(async () => {
  console.log("[proof-question-set] running...");

  await check("proposal: ≤10 questions, valid intents, every intent covered for a local business with a competitor", () => {
    const qs = proposeQuestionSet(LOCAL);
    assert.ok(qs.length > 0 && qs.length <= MAX_QUESTIONS_PER_SET, `${qs.length}`);
    for (const q of qs) assert.ok((QUESTION_INTENTS as readonly string[]).includes(q.intent));
    for (const intent of QUESTION_INTENTS) assert.ok(qs.some((q) => q.intent === intent), `missing ${intent}`);
    assert.ok(qs.some((q) => q.text.includes("Toledo, OH")));
  });

  await check("proposal never invents a location or a competitor", () => {
    const qs = proposeQuestionSet({ businessName: "GeoViz", businessCategory: "AI visibility software", isLocal: false, services: [] });
    assert.ok(!qs.some((q) => q.intent === "local_commercial_intent"), "no local questions without a location");
    assert.ok(!qs.some((q) => q.intent === "competitor_comparison"), "no competitor questions without a real competitor");
    assert.ok(!qs.some((q) => / in [A-Z]/.test(q.text.replace(/^Is GeoViz/, ""))), qs.map((q) => q.text).join(" | "));
  });

  await check("versions increment per subscription; context is recorded on the set", async () => {
    const f = makeProofFakes();
    const a = await proposeDraft(f.stores, SUB, LOCAL, T);
    const b = await proposeDraft(f.stores, SUB, LOCAL, T);
    const other = await proposeDraft(f.stores, { ...SUB, id: "sub_b" }, LOCAL, T);
    assert.ok(a.ok && b.ok && other.ok);
    if (a.ok && b.ok && other.ok) {
      assert.deepEqual([a.value.version, b.value.version, other.value.version], [1, 2, 1]);
      assert.deepEqual([a.value.businessCategory, a.value.city, a.value.state], ["roofing contractor", "Toledo", "OH"]);
      assert.equal(a.value.generatorVersion, "proof-questions@1.0.0");
    }
  });

  await check("drafts can be edited; approval freezes the wording", async () => {
    const f = makeProofFakes();
    const r = await proposeDraft(f.stores, SUB, LOCAL, T);
    assert.ok(r.ok);
    if (!r.ok) return;
    const edited = await editDraft(f.stores, SUB, r.value.id, [{ text: "Who are the best roofers in Toledo, OH?", intent: "unbranded_discovery", rationale: null }]);
    assert.ok(edited.ok);
    assert.ok((await approveSet(f.stores, SUB, r.value.id, "operator", T)).ok);
    const after = await editDraft(f.stores, SUB, r.value.id, [{ text: "A completely different question?", intent: "unbranded_discovery", rationale: null }]);
    assert.deepEqual(after, { ok: false, reason: FROZEN_MESSAGE });
    assert.equal((await f.stores.questionSets.getSet(SUB.id, r.value.id))!.items[0]!.text, "Who are the best roofers in Toledo, OH?");
  });

  await check("a measured set is permanently frozen, even if it were somehow still a draft", () => {
    assert.equal(decideEditItems({ status: "draft", firstMeasuredAt: T }, [{ text: "Who are the best roofers?", intent: "unbranded_discovery" }]).ok, false);
  });

  await check("approval validates: >10 items, duplicates and unknown intents are refused", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ text: `Question number ${i} about roofing?`, intent: "unbranded_discovery" as const }));
    assert.equal(decideApprove({ status: "draft", firstMeasuredAt: null, items: many as never }).ok, false);
    assert.equal(decideApprove({ status: "draft", firstMeasuredAt: null, items: [{ text: "Same question here?", intent: "unbranded_discovery" }, { text: "same question here", intent: "unbranded_discovery" }] as never }).ok, false);
    assert.equal(decideApprove({ status: "draft", firstMeasuredAt: null, items: [{ text: "Valid length question?", intent: "made_up" }] as never }).ok, false);
  });

  await check("activation syncs TrackedPrompts without editing text; old prompts deactivated (kept); previous set retired", async () => {
    const f = makeProofFakes();
    f.prompts.push({ id: "tp_old", subscriptionId: SUB.id, text: "Old organic question about roofs?", normalizedText: "old organic question about roofs", isActive: true });
    f.prompts.push({ id: "tp_keep", subscriptionId: SUB.id, text: "Who are the best roofing contractors in Toledo, OH?", normalizedText: "who are the best roofing contractors in toledo, oh", isActive: false });
    const v1 = await proposeDraft(f.stores, SUB, LOCAL, T);
    assert.ok(v1.ok);
    if (!v1.ok) return;
    await approveSet(f.stores, SUB, v1.value.id, "operator", T);
    assert.ok((await activateSet(f.stores, SUB, v1.value.id, T)).ok);
    const old = f.prompts.find((p) => p.id === "tp_old")!;
    assert.equal(old.isActive, false);
    assert.equal(old.text, "Old organic question about roofs?", "text never edited");
    assert.equal(f.prompts.find((p) => p.id === "tp_keep")!.isActive, true, "matching existing prompt reactivated, not duplicated");
    const set = (await f.stores.questionSets.activeSet(SUB.id))!;
    assert.ok(set.items.every((i) => i.trackedPromptId), "every item linked to a TrackedPrompt");
    assert.equal(f.prompts.filter((p) => p.subscriptionId === SUB.id && p.isActive).length, set.items.length);

    const v2 = await newVersionFrom(f.stores, SUB, v1.value.id, T);
    assert.ok(v2.ok);
    if (!v2.ok) return;
    assert.equal(v2.value.version, 2);
    assert.deepEqual(v2.value.items.map((i) => i.text), set.items.map((i) => i.text), "new version copies the wording");
    await approveSet(f.stores, SUB, v2.value.id, "operator", T);
    await activateSet(f.stores, SUB, v2.value.id, T);
    assert.equal((await f.stores.questionSets.getSet(SUB.id, v1.value.id))!.status, "retired");
    assert.equal((await f.stores.questionSets.activeSet(SUB.id))!.version, 2);
  });

  await check("only approved sets activate; only drafts approve", async () => {
    const f = makeProofFakes();
    const r = await proposeDraft(f.stores, SUB, LOCAL, T);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal((await activateSet(f.stores, SUB, r.value.id, T)).ok, false);
    await approveSet(f.stores, SUB, r.value.id, "operator", T);
    assert.equal((await approveSet(f.stores, SUB, r.value.id, "operator", T)).ok, false);
  });

  await check("wording: acronyms kept, natural plurals and articles, no category-restating service questions", () => {
    const texts = proposeQuestionSet({ businessName: "Toledo HVAC Pros", businessCategory: "HVAC company", services: ["Furnace repair"], isLocal: true, city: "Toledo", state: "OH" }).map((q) => q.text);
    assert.ok(texts.includes("Who are the best HVAC companies in Toledo, OH?"), texts.join(" / "));
    assert.ok(texts.includes("Can you recommend an HVAC company in Toledo, OH?"));
    const gv = proposeQuestionSet({ businessName: "GeoViz", businessCategory: "AI visibility audit service", services: ["AI visibility audits"], isLocal: false }).map((q) => q.text);
    assert.ok(gv.every((t) => !/\bai\b/.test(t)), "acronym lowercased");
    assert.ok(gv.includes("Who offers AI visibility audits?"), gv.join(" / "));
  });

  console.log(`[proof-question-set] passed=${passed} failed=${failed}`);
  if (failed > 0) process.exit(1);
})();
