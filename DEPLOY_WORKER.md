# GeoViz Worker — Railway Deployment

The GeoViz worker (`scripts/geo-worker.ts`) runs the GEO audit engine
(`scripts/run-geo-audit.sh` → `claude -p` → geo-seo-claude skill) against
queued orders in the database.

**Architecture split**
- **Vercel** — Next.js app: marketing pages, order form, Stripe checkout,
  webhook, admin dashboard, DB writes, Resend email send. Vercel never
  runs the audit engine; it only enqueues by setting
  `AuditOrder.reportStatus = "queued"`.
- **Railway** — long-running Node service that polls the queue, executes
  the audit, and writes the markdown back to the same database Vercel
  reads.

The worker process is **stateless** apart from the DB — all coordination
flows through `AuditOrder.reportStatus` (atomic claim from `queued` →
`running` → `generated` / `failed`).

---

## Exact Railway start command

```
npm run geo-worker:dev
```

This expands to `tsx scripts/geo-worker.ts --loop`. Loop mode polls the
queue forever (12-second cadence by default), processes one job at a
time, writes a terminal status on every code path, and shuts down
cleanly on `SIGTERM` / `SIGINT` so Railway redeploys drain in flight.

> Don't use `npm run geo-worker` (without `:dev`) on Railway — that's
> single-shot mode for cron-style runs.

---

## Required environment variables

Set these in Railway → Service → Variables. Match what Vercel uses for
overlap so both surfaces hit the same database.

| Var | Required | Description |
|---|---|---|
| `DATABASE_URL` | **yes** | Same Postgres connection string Vercel uses. End with `?sslmode=require` for Railway's internal Postgres. |
| `ANTHROPIC_API_KEY` | **yes** | The `claude` CLI is invoked with `-p` (headless / non-interactive). It needs an API key in the env unless you bake `claude login` into the image, which is not recommended for production. |
| `GEO_WORKER_POLL_MS` | optional | Loop poll cadence in ms. Default `12000` (12 s). |
| `GEO_WORKER_TIMEOUT_MS` | optional | Hard timeout for one wrapper run in ms. Default `120000` (2 min). |
| `GEO_WORKER_LOOP` | optional | If you don't want to pass `--loop` on argv, set this to `true`. |

**Do NOT set on the worker** the Vercel-only vars: `STRIPE_*`,
`RESEND_API_KEY`, `RESEND_EMAIL_FROM`, `AUDIT_NOTIFICATION_EMAIL`,
`ADMIN_SECRET`, `ADMIN_PASSWORD`. The worker doesn't need them.

---

## Preflight checks (worker fails loudly if any fail)

The worker runs these at startup before any DB query. Each failure is
fatal (`exit 1`) with a clear message:

1. **`DATABASE_URL` set** — otherwise the worker logs the Railway
   instructions and exits.
2. **`scripts/run-geo-audit.sh` exists** — fails if the file isn't in
   the deployed image.
3. **Wrapper script is executable** (`fs.accessSync(..., X_OK)`) — fails
   with a remediation hint to `chmod +x` and re-deploy.
4. **`claude` CLI is on `PATH`** — runs `claude --version`; aborts with
   instructions if not installed.

After preflight passes, the worker also runs `prisma.$connect()` once and
prints DB diagnostics (host, database name, fingerprint, total order
count, counts by `reportStatus`, latest 5 orders) so you can confirm the
worker is pointed at the same DB Vercel uses.

---

## Railway install / build steps

The worker host needs:

1. **Node 20+ and npm deps** — Nixpacks defaults handle this. Railway
   will pick up `package.json` and run `npm install`. `prisma generate`
   runs via the existing `postinstall` hook.

2. **Claude Code CLI** — install in your build phase. Pick one:
   ```
   # Build command (Railway → Settings → Build → Custom):
   npm install && npm install -g @anthropic-ai/claude-code
   ```
   Or bake into a custom Dockerfile:
   ```dockerfile
   RUN npm install -g @anthropic-ai/claude-code
   ```

3. **geo-seo-claude skill installed at `~/.claude/skills/geo/`** — the
   wrapper invokes `claude -p` with the geo skill. After Claude CLI is
   installed, run the skill installer once during build:
   ```
   ./vendor/geo-seo-claude/install.sh
   ```
   This provisions `~/.claude/skills/geo/SKILL.md`, the 15 sub-skills,
   the Python utilities, and the venv at `~/.claude/skills/geo/.venv/`.
   Bundled `requirements.txt` needs **Python 3.10+** (Pillow ≥ 12.1).
   On Railway's Nixpacks Python is recent enough; if Pillow fails,
   force Python 3.11:
   ```bash
   /usr/bin/python3.11 -m venv ~/.claude/skills/geo/.venv
   ~/.claude/skills/geo/.venv/bin/python3 -m pip install -r vendor/geo-seo-claude/requirements.txt
   ```

4. **Make `scripts/run-geo-audit.sh` executable** — git preserves the
   `+x` bit on Linux but it's worth re-asserting:
   ```
   chmod +x scripts/run-geo-audit.sh
   ```

5. **Start command** (Railway → Settings → Deploy):
   ```
   npm run geo-worker:dev
   ```

A complete custom build command for Railway:

```bash
npm install \
  && npm install -g @anthropic-ai/claude-code \
  && ./vendor/geo-seo-claude/install.sh \
  && chmod +x scripts/run-geo-audit.sh
```

Start command:

```bash
npm run geo-worker:dev
```

---

## Verifying it's working

Once Railway is running the worker, check the deploy logs for the
preflight + diagnostics block:

```
[geo-worker] preflight ok · claude 2.1.x (Claude Code)
[geo-worker] starting (loop) · poll=12000ms · timeout=120000ms · script=.../scripts/run-geo-audit.sh · log=.../tmp/geo-worker.log
[geo-worker] Prisma connected successfully
[geo-worker] db host=<railway-host>:<port> name=<db> fingerprint=<host>:<port>/<db>
[geo-worker] AuditOrder count=N byReportStatus={pending:X queued:Y running:0 generated:Z failed:W} sent=S
```

Open `/admin/reports?key=$ADMIN_SECRET` on Vercel → expand the **Debug
DB** panel. The fingerprint shown there must match the worker's
`fingerprint=...` line. If they don't match, the two surfaces are on
different databases and the worker will never see the queued rows.

Click **Run GEO Audit** on a paid order in the dashboard. Within 12 s
the worker logs `queued job found … audit started`. Within 1–3 minutes
it logs `audit completed … report saved`. The dashboard's polling
useEffect will flip the pill from yellow (queued) → blue (running) →
green (generated) automatically — no refresh needed.

---

## Operational notes

- **Graceful shutdown** — the worker traps `SIGTERM` and `SIGINT`,
  finishes the current job, disconnects Prisma, exits 0. Safe for
  Railway redeploys.
- **Atomic claim** — the worker's `updateMany WHERE reportStatus = "queued"`
  ensures only one Railway instance ever claims a given row, even if
  you scale to multiple workers.
- **Hard 2-minute timeout** — if `claude -p` hangs, the wrapper is
  SIGKILL'd and the row is marked `failed` with `reason: timeout` plus
  the last 20 lines of stderr. The UI never gets stuck.
- **File log** — `tmp/geo-worker.log` accumulates ISO-timestamped
  copies of every console line. Railway's filesystem is ephemeral, so
  treat this as in-process diagnostics; for persistent log retention
  use Railway's deploy-log streaming.
- **Vercel never runs the audit engine** — the only spawn happens here.
  `grep -rn "child_process" src/` returns zero hits in the Next bundle.
