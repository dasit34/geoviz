# GeoViz — Bulletproof API-mode preflight

## Context
Railway has `GEO_AUDIT_MODE=api` and `ANTHROPIC_API_KEY` set, but deploy
logs still show the CLI-mode error `Claude CLI not callable on PATH`.

Diagnosis (from reading the current file):
- `scripts/geo-worker.ts` line 685 already has the API-mode branch with an
  `early return` on line 698. Once `AUDIT_MODE === "api"` is true, the
  CLI-mode checks below it cannot execute.
- The bug therefore must be one of two things:
  1. **Stale Railway deploy** — Railway is still running a pre-API-mode
     commit. The fix is a redeploy.
  2. **Env-var parsing edge case** — `GEO_AUDIT_MODE` has trailing
     whitespace, a stray `\r`, or unexpected casing that the current
     `(process.env.GEO_AUDIT_MODE ?? "api").toLowerCase()` doesn't strip,
     so `AUDIT_MODE` is something like `"api "` or `"api\r"` and the
     equality check `=== "api"` fails. Railway's "Variables" panel often
     trims, but pasted values from copied env files sometimes don't.

The fix this turn makes the parser bulletproof against both edge cases
AND adds an explicit log at the top of preflight that prints the resolved
mode, so the next Railway log will tell the operator exactly which path
was taken. If the issue is just stale code, the new log line proves the
new code is running.

## Already done this turn
- Read-only confirmation that the file's current structure is correct.
  No edits attempted.

## Plan — remaining work

### 1. `scripts/geo-worker.ts` — three small changes
- **Robust env parse**: replace
  `(process.env.GEO_AUDIT_MODE ?? "api").toLowerCase()` with
  `(process.env.GEO_AUDIT_MODE ?? "").trim().toLowerCase()` and a fallback
  rule: when empty AND `ANTHROPIC_API_KEY` is set → `"api"`, else
  `"api"` (still default to api). This kills the whitespace / `\r`
  edge case.

- **Log resolved mode at the top of `preflightOrExit()`**, including the
  raw env value so an operator can see exactly what Railway delivered:
  ```ts
  log(`[geo-worker] resolved AUDIT_MODE='${AUDIT_MODE}' (raw GEO_AUDIT_MODE=${JSON.stringify(process.env.GEO_AUDIT_MODE ?? null)})`);
  ```
  Never logs the API key.

- **Add an extra "API mode never invokes the CLI" guard log** so it's
  obvious from the deploy logs which branch executed:
  ```ts
  if (AUDIT_MODE === "api") {
    log("[geo-worker] api mode — skipping Claude CLI / wrapper checks");
    // ...existing ANTHROPIC_API_KEY check + log
  }
  ```

### 2. Build + smoke test
- `npm run build`
- `GEO_AUDIT_MODE=api npm run geo-worker` once locally — confirm logs:
  - `resolved AUDIT_MODE='api' (raw GEO_AUDIT_MODE="api")`
  - `api mode — skipping Claude CLI / wrapper checks`
  - `preflight ok · mode=api · model=claude-sonnet-4-6 · ANTHROPIC_API_KEY length=N`
- `GEO_AUDIT_MODE=" API " npm run geo-worker` (with whitespace + uppercase)
  — confirm trim+lowercase normalize correctly to `"api"` and the API
  branch fires.
- `GEO_AUDIT_MODE=cli npm run geo-worker` — confirm CLI mode still works
  (claude is on PATH locally so it succeeds).

### 3. Commit + push so Railway picks up the new code
After the operator reviews and approves, commit + push. Railway will
redeploy automatically. The new logs will either:
- Show `mode=api` clearly → confirms code is running, fix landed.
- Still show `mode=cli` or the old error verbatim → proves Railway is
  serving stale code from before the API-mode commit; the operator will
  need to trigger a manual redeploy on the dashboard or check that the
  branch Railway tracks matches the branch they pushed to.

## Files to modify
- `scripts/geo-worker.ts` — three small surgical changes (env parse +
  two log lines)

## Files NOT touched (per spec)
- Vercel UI, Stripe, webhook, Resend, scoring engine, Prisma schema,
  Dockerfile, DEPLOY_WORKER.md, marketing pages.

## Expected Railway logs after redeploy
```
[geo-worker] resolved AUDIT_MODE='api' (raw GEO_AUDIT_MODE="api")
[geo-worker] api mode — skipping Claude CLI / wrapper checks
[geo-worker] preflight ok · mode=api · model=claude-sonnet-4-6 · ANTHROPIC_API_KEY length=...
[geo-worker] Prisma connected successfully
[geo-worker] db host=...
[geo-worker] AuditOrder count=...
[geo-worker] starting (loop) · poll=12000ms · timeout=120000ms · ...
[geo-worker] poll #1 starting
[geo-worker] poll #1 done · no queued jobs · waiting 12s before next poll
```
