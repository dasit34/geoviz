# syntax=docker/dockerfile:1
#
# GeoViz worker — Railway / generic Linux container image.
#
# Architecture split:
#   - Vercel runs the Next.js app (UI, Stripe, webhook, dashboard, DB writes,
#     email send).
#   - This container runs the queue worker (`scripts/geo-worker.ts`) which
#     polls the database for queued audits, calls the Anthropic API to run
#     the audit, and writes the markdown back to Postgres.
#
# Production runs in API mode (no Claude CLI, no Python, no skills bundle).
# The worker calls Anthropic's Messages API directly with the web_search
# tool enabled, so the model fetches the live page itself.
#
# Start command (Railway → Service → Settings → Deploy):
#   npm run geo-worker:dev   (loop mode — never exits except on SIGTERM)
#
# Required env vars at runtime:
#   - DATABASE_URL              same Postgres URL Vercel uses
#   - ANTHROPIC_API_KEY         direct API key (no `claude login`)
#   - GEO_AUDIT_MODE=api        production default; set explicitly to be safe
#   - GEO_WORKER_POLL_MS        optional, default 12000
#   - GEO_WORKER_TIMEOUT_MS     optional, default 120000
#

FROM node:20-bookworm-slim

# ---- minimal runtime deps ----
# In API mode the worker does not need bash / git / python — just node +
# Anthropic SDK + Prisma + Postgres SSL roots. ca-certificates covers the
# outbound HTTPS to api.anthropic.com.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- install JS deps (cached on package*.json hash) ----
# `npm ci` runs the postinstall hook (`prisma generate`), which needs the
# schema in place. Copy package manifests + prisma/ first so the layer is
# cacheable independent of source changes.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- copy the rest of the source ----
COPY . .

# ---- start: loop-mode worker, drains on SIGTERM ----
# GEO_AUDIT_MODE defaults to "api" — no Claude CLI install needed.
CMD ["npm", "run", "geo-worker:dev"]
