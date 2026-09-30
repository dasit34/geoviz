# Daily Market Study Automation

Runs the existing Market Study bulk-audit workflow once a day: pick an
industry/location from a rotation, discover up to `MARKET_STUDY_DAILY_BATCH_SIZE`
businesses, qualify and filter them, queue them onto the existing
`AuditOrder` worker queue, then email a deterministic analytics
summary once the batch finishes.

This is a **separate Railway service** from the audit worker
(`geo-worker`) — it never touches `scripts/geo-worker.ts`, the scoring
engine, or the manual Market Study admin flow. See
`src/lib/market-studies/automation/` for the implementation and
`RAILWAY_WORKER_SETUP.md` for the (unrelated, unmodified) audit
worker's own setup.

---

## What it does, each cron tick

`scripts/daily-market-study-automation.ts` calls `runTick()`
(`src/lib/market-studies/automation/runTick.ts`), which does exactly
one of these per invocation:

1. **Finalize**, if an in-progress automated batch has fully drained
   (every entry completed/failed/skipped) — computes the summary and
   sends the email, marks the run `"completed"`.
2. **Kick off**, if automation is enabled, it's on/after the
   configured run hour (UTC), and no run exists yet for today —
   discovers, qualifies, excludes, and enqueues today's batch.
3. **Retry**, if today's run failed transiently and is still under
   the retry budget.
4. Otherwise, a cheap no-op (one indexed query).

Because it's idempotent and cheap when there's nothing to do, running
it every ~15 minutes is safe.

---

## Railway service setup

Service type: **Cron Schedule** (Railway's scheduled-run service
type — runs the start command on a schedule, then exits; distinct
from the worker's always-on service type).

| Setting | Value |
|---|---|
| Source | Same GitHub repo as `geo-worker` and the Vercel deploy |
| Branch | `main` |
| Root directory | `/` (repo root) |
| Build command | `npm install` (runs `postinstall` → `prisma generate`) |
| Start command | `npm run market-study:daily-cron` |
| Cron schedule | `*/15 * * * *` (every 15 min) — verify this is at or above Railway's minimum cron interval for your plan before saving |
| Restart policy | Default (a failed run just logs and exits non-zero; the next scheduled tick tries again) |

### Required env vars (Railway → this service → Variables)

This service needs a **different** set of secrets than `geo-worker` —
it does discovery + email, not audit generation:

| Var | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **Required** | Same Postgres URL as the worker/Vercel app. |
| `OUTSCRAPER_API_KEY` | **Required** (or `GOOGLE_PLACES_API_KEY`, matching whichever provider `MARKET_STUDY_DAILY_DISCOVERY_PROVIDER` names) | Discovery provider key. |
| `RESEND_API_KEY` | Required for the summary email | Without it, kickoff/finalize still work — the email send is skipped with a warning log, never a crash. |
| `RESEND_EMAIL_FROM` | Recommended | Same convention as `notify-operator-report-ready.ts` — falls back to a hardcoded verified sender if unset. |
| `AUDIT_NOTIFICATION_EMAIL` or `MARKET_STUDY_DAILY_RECIPIENT_EMAIL` | Required for the summary email | Who receives the daily summary. |
| `MARKET_STUDY_DAILY_AUTOMATION_ENABLED` | Required | `"true"` to actually run; `"false"`/unset = fully inert. |
| `MARKET_STUDY_DAILY_BATCH_SIZE` | Optional | Default `50`. |
| `MARKET_STUDY_DAILY_RUN_HOUR_UTC` | Optional | Default `13`. |
| `MARKET_STUDY_DAILY_INDUSTRIES` | Required when enabled | Comma-separated. |
| `MARKET_STUDY_DAILY_LOCATIONS` | Required when enabled | Comma-separated `"City, ST"`. |
| `MARKET_STUDY_DAILY_DISCOVERY_PROVIDER` | Optional | Default `outscraper`. |
| `MARKET_STUDY_DAILY_QUALIFY_CONCURRENCY` | Optional | Default `3`. |
| `MARKET_STUDY_DAILY_MAX_RETRIES` | Optional | Default `3`. |
| `MARKET_STUDY_DAILY_COST_CEILING_USD` | Optional | Unset = no ceiling. |

Vars this service does **not** need: `STRIPE_*`, `ADMIN_SECRET`/`ADMIN_PASSWORD` (the cron script never calls an admin route — it imports the same lib functions directly), `ANTHROPIC_API_KEY` (audit generation is still `geo-worker`'s job).

---

## Enable / disable

- **Enable**: set `MARKET_STUDY_DAILY_AUTOMATION_ENABLED=true` plus
  `MARKET_STUDY_DAILY_INDUSTRIES`/`MARKET_STUDY_DAILY_LOCATIONS` on
  this service, redeploy (or just wait for the next cron tick to pick
  up the new env — Railway Cron Schedule re-reads env on every run).
- **Disable**: flip the flag to `false`, or pause/delete the Cron
  Schedule in the Railway dashboard. `geo-worker` and the manual
  Market Study admin flow are unaffected either way.

## Monitor

- Railway service logs for this service — every action logs with the
  `[market-study-daily]` prefix, e.g.:
  ```
  [market-study-daily] tick starting
  [market-study-daily] kickoff done runId=... studyId=... collected=50 qualified=31 queued=48 skipped=2
  [market-study-daily] tick done · {"action":"kicked-off","runId":"...","collected":50,...}
  ```
- The resulting study shows up in `/admin/market-studies` like any
  other Market Study — named `Daily Automation — {industry} — {city}, {state} — {date}`.
- `MarketStudyAutomationRun` rows (via `npx prisma studio` or a direct
  query) show `status`, counts, and `lastError` for any failed day.

## Manual on-demand test (no waiting for the schedule)

```
POST /api/admin/market-studies/daily-automation/test-run?key=<ADMIN_SECRET>
Content-Type: application/json

{ "businessCount": 2, "industry": "hvac", "city": "Dayton", "state": "OH" }
```

- `businessCount` is clamped to 2–5.
- `industry`/`city`/`state` are optional — omit them to use today's
  real rotation pick (requires `MARKET_STUDY_DAILY_INDUSTRIES`/
  `MARKET_STUDY_DAILY_LOCATIONS` to already be configured).
- Runs the exact same discover → qualify → exclude → enqueue path as
  the real daily job — not a mock. Uses `isManualTest: true` +
  a full-precision timestamp, so it never consumes or collides with
  the real daily run's "one per calendar day" slot.
- **Cannot send outreach**: the kickoff path has no call into
  `src/lib/outbound/*` anywhere — verified in this feature's own test
  (`scripts/test-market-study-automation-idempotency.ts` covers the
  claim/retry state machine; the "no outreach" property was verified
  manually against production during implementation by confirming
  zero new `LeadOutreach` rows after a real 2-business test run).
- The response includes `studyUrl` — open it in the admin dashboard to
  watch the 2 audits complete in real time (same worker, same ~1–3 min
  per audit).

## Rollback

Disable the env var and/or delete the Cron Schedule service — no code
revert is required for safety (the feature is fully inert when
disabled). To remove it from the codebase entirely, revert the
feature's commits and, if desired, drop the `MarketStudyAutomationRun`
table (optional — nothing else references it, so leaving it in place
indefinitely is harmless).
