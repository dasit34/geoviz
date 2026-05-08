# Gold Standard Sample Reports — Playbook

Three benchmark reports we generate, polish, and use as sales / demo assets. They are not fake — they are real audits of real, publicly-listed local businesses chosen as archetypes.

> **This is a manual operator task.** It costs Anthropic API tokens (the audit engine is not free) and 1–3 minutes per audit, and the operator needs to make the URL choices. Do not have an LLM autonomously kick off real-spend audits.

## Three archetypes

Pick one publicly-listed business per archetype. Use a real, well-known local operator that you do not have a relationship with — that way the audit is honest and the demo is credible.

1. **HVAC / contractor.** Suggested archetype: a residential HVAC company in a mid-size US metro. Should have a real website (not just a Google Business listing) so there's something to audit.
2. **Law firm.** Suggested archetype: a small (1–10 attorney) regional firm with practice-area pages.
3. **Med spa or dental practice.** Suggested archetype: a single-location med spa or dental clinic with services + booking pages.

Avoid: national chains (their AI visibility is artificially good), single-page sites (nothing to score), and any business whose owner you know personally (consent issues).

## Generation procedure

Repeat for each archetype:

1. **Pick the URL.** Confirm the site is reachable, English-language, and has at least a homepage + a services or practice-area page.
2. **Create the order.** Either:
   - Use the public `/order` form with your own email, run a real Stripe checkout in **test mode** (use `4242 4242 4242 4242`), then trigger the local Stripe CLI webhook forwarder so the row appears at `/admin/reports`. Mark `businessName` as `[GOLD] HVAC sample` (or `[GOLD] Law sample`, etc.) so you can find it later.
   - OR: insert a paid order row directly via Prisma Studio (`npx prisma studio`) with `paymentStatus = "paid"`, `businessName = "[GOLD] HVAC sample"`, the URL set, and `reportStatus = "pending"`. This skips Stripe entirely and is simpler if you don't have webhooks wired locally.
3. **Run the audit** by clicking **Run GEO Audit** in the admin dashboard. Worker must be running locally with `GEO_AUDIT_MODE=api`.
4. **Review carefully.** Read the full markdown. Score should be believable for a typical local business — most archetype sites land in the 35–60 range. If the audit invents claims (e.g., scores a category 18/20 with no supporting evidence), flag the run as weak and re-pick a different archetype URL — do not edit the report to make it look better.
5. **Verify the PDF.** Click **Download PDF** and confirm:
   - No broken card splits across pages.
   - No half-page dead zones.
   - The Foundation Fix CTA is not orphaned alone on its own page.
   - All sections (Hero, Score, Issues, Fixes, Impact, Foundation Fix CTA, Tech Details) are present.
6. **Verify the hosted link.** `https://<your-domain>/report/<id>/print` opens cleanly without admin controls.
7. **Save the assets.** Download the PDF and save it as `samples/hvac-sample.pdf`, `samples/lawfirm-sample.pdf`, or `samples/medspa-sample.pdf` (do not commit to the repo unless the audited business has consented to publication). Keep the public hosted URL handy for outbound sales — those URLs are share-safe (they're CUID-gated, not indexed).

## Quality bar

A gold sample is acceptable when:

- The score is in the 30–65 range (low enough that "you can do better" is the obvious takeaway, not so low it reads as a dunk).
- The three issues are concrete and specific to the audited site, not generic platitudes.
- The three fixes are executable by a small business operator or a developer in <1 day each.
- The PDF reads as a premium consulting deliverable, not a script-generated dump.
- Every claim in the report is verifiable by viewing the actual website.

If a generated sample fails any of these bars, do not patch the markdown — re-run with a different archetype URL or revisit the audit prompt in the next prompt-revision pass.

## After generation

- [ ] HVAC sample saved to `samples/hvac-sample.pdf`, hosted URL recorded.
- [ ] Law firm sample saved to `samples/lawfirm-sample.pdf`, hosted URL recorded.
- [ ] Med spa / dental sample saved to `samples/medspa-sample.pdf`, hosted URL recorded.
- [ ] Each PDF reviewed against the quality bar above.
- [ ] Any weak output flagged and re-run, not patched.

These three samples become the standard demo set for the pilot. Refresh the cohort once the prompt or rubric materially changes.
