# GeoViz Worker — Railway Deployment

The GeoViz worker (`scripts/geo-worker.ts`) processes queued GEO audits
from the database. Production runs in **API mode** — direct calls to the
Anthropic Messages API with the `web_search` tool. No Claude CLI, no
Python venv, no shell wrapper required.

**Architecture split**
- **Vercel** — Next.js app: marketing pages, order form, Stripe checkout,
  webhook, admin dashboard, DB writes, Resend email send. Vercel never
  runs the audit engine; it only enqueues by setting
  `AuditOrder.reportStatus = "queued"`.
- **Railway** — long-running Node service that polls the queue, calls
  Anthropic for the audit, and writes the markdown back to the same
  database Vercel reads.

The worker is **stateless** apart from the DB. All coordination flows
through `AuditOrder.reportStatus` (atomic claim from `queued` → `running`
→ `generated` / `failed`).

---

## Exact Railway start command

```
npm run geo-worker:dev
```

Loop mode polls the queue forever (12 s cadence by default), processes one
job at a time, writes a terminal status on every code path, and shuts down
cleanly on `SIGTERM` / `SIGINT` so Railway redeploys drain in flight.

---

## Required environment variables

Set these in Railway → Service → Variables.

| Var | Required | Description |
|---|---|---|
| `DATABASE_URL` | **yes** | Same Postgres connection string Vercel uses. End with `?sslmode=require` for Railway's internal Postgres. |
| `ANTHROPIC_API_KEY` | **yes** | Direct Anthropic API key. The worker calls `messages.create` with `web_search`. |
| `GEO_AUDIT_MODE` | **yes** | Set to `api` (production default). The worker also accepts `cli` as a dev fallback that spawns `scripts/run-geo-audit.sh` — do not use `cli` on Railway. |
| `GEO_WORKER_POLL_MS` | optional | Loop poll cadence in ms. Default `12000`. |
| `GEO_WORKER_TIMEOUT_MS` | optional | Hard timeout per audit in ms. Default `120000` (2 min). |
| `ANTHROPIC_MODEL` | optional | Model id. Default `claude-sonnet-4-6`. |
| `ANTHROPIC_MAX_TOKENS` | optional | Default `16000`. |

**Do NOT set on the worker** the Vercel-only vars: `STRIPE_*`,
`RESEND_API_KEY`, `RESEND_EMAIL_FROM`, `AUDIT_NOTIFICATION_EMAIL`,
`ADMIN_SECRET`, `ADMIN_PASSWORD`. The worker doesn't need them.

---

## Preflight checks (worker fails loudly if any fail)

The worker runs these at startup before any DB query. Each failure is
fatal (`exit 1`) with a clear message:

1. **`DATABASE_URL` set** — otherwise the worker logs the Railway hint
   and exits.
2. **`GEO_AUDIT_MODE`** is `api` or `cli` (anything else → fatal).
3. **API mode** — `ANTHROPIC_API_KEY` set; otherwise fatal with a
   Railway-specific hint.
4. **CLI mode** (dev only) — wrapper script exists + `+x` + `claude`
   binary on PATH. None of these are required in API mode.

After preflight passes, the worker runs `prisma.$connect()` once and
prints DB diagnostics (host, database, fingerprint, total order count,
counts by `reportStatus`, latest 5 orders) so you can confirm Vercel and
the worker are pointed at the same database.

---

## Railway deploy

The repo's `Dockerfile` is the production build. Railway will detect it
automatically (Builder = Dockerfile). It is intentionally minimal — no
Claude CLI install, no Python deps, no skill bundle — because API mode
needs none of that.

1. Push the repo to GitHub.
2. Railway → New service → Deploy from repo.
3. Service → Variables → set the env vars above.
4. Service → Settings → confirm **Builder = Dockerfile** and the start
   command is the Dockerfile's `CMD` (`npm run geo-worker:dev`).
5. Trigger a deploy. Watch the deploy logs for:
   ```
   [geo-worker] preflight ok · mode=api · model=claude-sonnet-4-6 · ANTHROPIC_API_KEY length=...
   [geo-worker] Prisma connected successfully
   [geo-worker] db host=<railway-host>:<port> name=<db> fingerprint=<host>:<port>/<db>
   [geo-worker] AuditOrder count=N byReportStatus={pending:X queued:Y running:0 generated:Z failed:W} sent=S
   [geo-worker] starting (loop) · poll=12000ms · timeout=120000ms · ...
   [geo-worker] poll #1 starting
   [geo-worker] poll #1 done · no queued jobs · waiting 12s before next poll
   ```

Open `/admin/reports?key=$ADMIN_SECRET` on Vercel → expand the **Debug
DB** panel. Compare the fingerprint there against the worker's
`fingerprint=...` line — they must match. Then click **Run GEO Audit**
on a paid order. Within 12 s the worker logs:

```
[geo-worker] queued job found orderId=...
[geo-worker] audit started orderId=...
[geo-worker] starting audit (api mode) model=claude-sonnet-4-6 maxTokens=16000
[geo-worker] api response received elapsedMs=<NN> stopReason=end_turn bytes=<NNNN>
[geo-worker] markdown length orderId=... bytes=<NNNN>
[geo-worker] report saved orderId=...
[geo-worker] audit completed orderId=...
```

The dashboard's polling effect (5 s cadence) auto-flips the pill from
yellow (queued) → blue (running) → green (generated) without a refresh.

---

## Operational notes

- **Graceful shutdown** — the worker traps `SIGTERM` and `SIGINT`,
  finishes the current job, disconnects Prisma, exits 0.
- **Atomic claim** — `updateMany WHERE reportStatus = "queued"` ensures
  only one Railway instance ever claims a given row, even if you scale
  to multiple workers.
- **Hard 2-minute timeout** — `AbortController` aborts the API call if
  it hangs. The row is marked `failed` with `reason: timeout`.
- **No Claude CLI dependency** — the production container does not need
  the Claude Code CLI. CLI mode is preserved only as a dev convenience
  (set `GEO_AUDIT_MODE=cli` locally to spawn the wrapper).
- **Vercel never runs the audit engine** — `grep -rn "child_process" src/`
  returns zero hits in the Next bundle.

---

## Local dev

```bash
# API mode (production-equivalent)
GEO_AUDIT_MODE=api npm run geo-worker:dev

# CLI fallback (only if you have Claude CLI installed locally)
GEO_AUDIT_MODE=cli npm run geo-worker:dev
```
