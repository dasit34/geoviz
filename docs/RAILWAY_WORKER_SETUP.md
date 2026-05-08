# Railway Worker Setup

The GeoViz audit worker runs as a separate long-running Node process from the Vercel web app. Vercel functions cannot run the worker (the audit takes 1–3 minutes per job, exceeding any sane serverless timeout). Railway is the recommended host. This document is the authoritative setup runbook.

---

## What the worker does

`scripts/geo-worker.ts` is a single-purpose poll-and-process loop. Every cycle it:

1. Polls Postgres (`prisma.auditOrder.findFirst({ where: { reportStatus: "queued" }, orderBy: { reportQueuedAt: "desc" } })`) for the **newest** queued order.
2. **Atomically claims** the row by flipping `reportStatus: "queued" → "running"` with a `WHERE reportStatus = "queued"` guard. Two workers cannot double-claim — the second `updateMany` returns `count: 0` and skips.
3. Runs the audit. In production (`GEO_AUDIT_MODE=api`, the default) this is a direct **Anthropic SDK** call from the worker process — no shell script, no Claude CLI, no Python venv, no skills directory. The shell-and-CLI path (`scripts/run-geo-audit.sh`) is only used when `GEO_AUDIT_MODE=cli`, which is the dev-only fallback.
4. On success: writes `reportStatus: "generated"`, `reportMarkdown`, `reportGeneratedAt`. Logs the score breakdown.
5. On failure: writes `reportStatus: "failed"`, `reportError` (the error message + last 20 lines of stderr if applicable). The row never sticks at `"running"` — every code path writes a terminal status, including unexpected exceptions (try/finally guard).
6. Sleeps `GEO_WORKER_POLL_MS` (default 12s) and goes again.

The worker does **not** send customer emails. That's the Vercel admin route. The worker's only side effect is the database write.

---

## Service setup on Railway

Service type: **regular long-running service** (not a cron job, not a one-shot deploy).

| Setting | Value |
|---|---|
| Source | Same GitHub repo as the Vercel deploy |
| Branch | `main` |
| Root directory | `/` (repo root) |
| Build command | `npm install` *(Railway auto-runs `postinstall` which calls `prisma generate`)* |
| Start command | `npm run geo-worker:start` |
| Healthcheck | None needed — the worker is not an HTTP server |
| Restart policy | `On failure` (Railway default). Loop mode catches exceptions; only a fatal preflight will exit 1. |

> The repo also has `geo-worker:dev` which is the same command (`tsx scripts/geo-worker.ts --loop`). Use `geo-worker:start` for production setups so the script name reads correctly in dashboards and incident notes.

---

## Required env vars (Railway → Service → Variables)

Set these on the Railway service (NOT inherited from Vercel — Railway is a separate environment). The worker exits 1 at preflight if any of the required ones are missing.

| Var | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **Required** | Same Postgres URL the Vercel app reads. For Neon / Supabase / Railway Postgres, append `?sslmode=require` to the URL. The worker fingerprints the host at startup and logs it; cross-check against the admin dashboard's Debug DB panel. |
| `ANTHROPIC_API_KEY` | **Required** | Validated to start with `sk-ant-` by `src/lib/env.ts`. Worker preflight also checks presence. |
| `GEO_AUDIT_MODE` | Recommended | `api` is the production default (full 6-section audit). `fast` is a shorter API call (summary + quick wins + score). `cli` is local-only — **never set this in production**. If unset, the worker defaults to `api`. |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-sonnet-4-6`. Override only with intent. |
| `ANTHROPIC_MAX_TOKENS` | Optional | Defaults to 8000. Tune up if reports are getting truncated. |
| `GEO_WORKER_TIMEOUT_MS` | Optional | Per-audit hard cap. Default 300000 (5 minutes). |
| `GEO_WORKER_POLL_MS` | Optional | Sleep between polls when idle. Default 12000 (12s). |
| `GEO_WORKER_SLOW_WARN_MS` | Optional | Logs a warning if a single audit exceeds this. Default 90000 (90s). |

### Vars the worker does NOT need

The Vercel app needs these, the Railway worker does not — leaving them off Railway is intentional (smaller blast radius if Railway is compromised, no hidden cross-environment dependencies):

- `STRIPE_*` — checkout and webhook are Vercel-only.
- `RESEND_*`, `EMAIL_FROM`, `EMAIL_TO`, `AUDIT_NOTIFICATION_EMAIL` — customer + admin emails are sent by Vercel admin routes, not the worker.
- `ADMIN_SECRET`, `ADMIN_PASSWORD` — admin auth surfaces are Vercel-only.
- `NEXT_PUBLIC_*`, `SITE_URL` — only the web app builds URLs.

---

## What does NOT work on Railway

These are all `cli`-mode-only dependencies and are intentionally bypassed by the production `api`-mode default:

- **`scripts/run-geo-audit.sh`** — the shell wrapper. Requires `claude` CLI on PATH. Skipped in api mode.
- **Claude Code CLI binary** — required only by `cli` mode. Not installable on a Railway image without significant work, and not needed.
- **`~/.claude/skills/geo`** — the bundled skill directory. CLI-mode-only.
- **Python `.venv` at `~/.claude/skills/geo/.venv/bin/python3`** — installed by `vendor/geo-seo-claude/install.sh`. CLI-mode-only.
- **Local `claude login` / `~/.claude/auth.json`** — never needed on Railway. The worker authenticates to Anthropic with `ANTHROPIC_API_KEY`.

There is **one** filesystem assumption that does work on Railway but is worth knowing about:

- **`tmp/geo-worker.log`** — the worker appends every log line to this file (in addition to stdout). Railway containers have a writable filesystem, so this is fine. The file is ephemeral across container restarts; rely on Railway's stdout log retention as the durable record.

---

## Worker logs (already implemented)

The current worker emits all of the following:

| Event | Log line (prefix) |
|---|---|
| Worker started | `[geo-worker] starting (loop) · poll=…ms · timeout=…ms` |
| Preflight passed | `[geo-worker] preflight ok · mode=api · model=… · maxTokens=…` |
| DB connected | `[geo-worker] Prisma connected successfully` + DB fingerprint |
| Polling | `[geo-worker] poll #N starting` / `[geo-worker] poll #N done · …` |
| Order claimed | `[geo-worker] picked job orderId=… url=…` |
| Claimed by another worker | `[geo-worker] orderId=… was claimed by another worker — skipping` |
| Audit started | `[geo-worker] audit started orderId=…` |
| Audit completed (success) | `[geo-worker] audit completed orderId=… elapsedMs=…` |
| Score breakdown | `[geo-worker] score breakdown orderId=… schema=…/25 crawler=…/20 …` |
| Report saved | `[geo-worker] report saved orderId=… dbReportStatus=generated bytes=…` |
| Audit failed | `[geo-worker] audit failed orderId=… reason=… exit=… elapsedMs=…` |
| DB save failed (rare) | `[geo-worker] DB SAVE FAILED orderId=… after successful Anthropic response` |
| Worker exception (caught) | `[geo-worker] worker exception during orderId=…` |
| Graceful shutdown | `[geo-worker] SIGTERM received — finishing current poll then exiting` |

No code changes needed for log coverage. Read `tmp/geo-worker.log` locally; in production, read Railway's service logs.

---

## Post-deploy test (manual, ~5 minutes)

Run these in order, the first time you point Railway at production:

1. **Boot check.** Open the Railway service logs. Within ~10s of deploy you should see (in order):
   ```
   [geo-worker] resolved AUDIT_MODE='api' (raw GEO_AUDIT_MODE="api")
   [geo-worker] Prisma connected successfully
   [geo-worker] preflight ok · mode=api · model=claude-sonnet-4-6 · maxTokens=8000 · timeoutMs=300000 · slowWarnMs=90000 · ANTHROPIC_API_KEY length=…
   [geo-worker] starting (loop) · poll=12000ms · timeout=300000ms · script=… · log=…
   [geo-worker] poll #1 starting
   [geo-worker] poll #1 done · no queued jobs · waiting 12s before next poll
   ```
   If the first three are missing, you have a preflight problem (DB or API key). Fix and redeploy.
2. **DB fingerprint match.** The worker startup logs include the DB host/database/fingerprint. Open `/admin/reports?key=<ADMIN_SECRET>` on Vercel, expand the **Debug DB** panel, and compare. They MUST match — otherwise Vercel and Railway are pointed at different databases.
3. **End-to-end audit.** From `/admin/reports`, click **Run GEO Audit** on a known test order. Within 12s the worker should pick it up:
   ```
   [geo-worker] picked job orderId=… url=…
   [geo-worker] audit started orderId=…
   ```
   Within ~60–180s you should see:
   ```
   [geo-worker] audit completed orderId=… elapsedMs=…
   [geo-worker] report saved orderId=… dbReportStatus=generated bytes=…
   ```
   The admin dashboard's per-card poll picks up the change automatically — banner flips to `Report ready — needs review`.
4. **Failure path.** Force a failure (run an audit on `https://example-that-fails.invalid`) and confirm the row ends in `reportStatus = "failed"` with the stderr captured in `reportError`, AND the worker keeps polling (didn't crash).
5. **Restart resilience.** Restart the Railway service. The worker should boot back up, log the same preflight, and resume polling. Any in-flight job at the time of restart will be re-claimed by the next worker boot if it was stuck in `"running"` (operator can re-queue manually if needed — re-queueing flips it back to `"queued"`).

If all five pass, the worker is production-ready.

---

## Troubleshooting

- **`PREFLIGHT FAILED — DATABASE_URL is not set`** — Railway service variables panel. Add `DATABASE_URL` (with `?sslmode=require` for managed Postgres providers) and redeploy.
- **`PREFLIGHT FAILED — ANTHROPIC_API_KEY not set`** — same place. The key must start with `sk-ant-`.
- **Prisma connection FAILED** — the URL is set but unreachable. Most common cause: missing `?sslmode=require` for Neon / Supabase. Check the Postgres provider's connection string instructions.
- **Order stays `Queued — waiting on worker` for >30s** — the Railway worker isn't running, isn't pointed at the same DB, or has crashed. Check Railway service logs.
- **Order goes to `Generating report` and never finishes** — the audit hit the 5-minute hard cap, OR the worker crashed mid-audit. `reportStatus = "failed"` should be written by the timeout/exception handler; if it's stuck at `"running"`, the process was killed mid-write. Re-queue manually.
- **`spawnSync claude ENOENT`** in the logs — `GEO_AUDIT_MODE` was set to `cli` (or unset and resolved oddly). Set `GEO_AUDIT_MODE=api` and redeploy.

---

## One-line summary for ops

> Long-running Railway service. Start: `npm run geo-worker:start`. Required env: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GEO_AUDIT_MODE=api`. No Stripe / Resend / admin vars needed. Polls Postgres, runs Anthropic API calls, writes back to Postgres. The Vercel app does the rest.
