# GeoViz ChatGPT plugin (v1, Preview only)

Status: built on `feat/geoviz-chatgpt-plugin`, deployed only to a Vercel Preview.
**Not merged, not in Production, not submitted.**

**Validation:** the MCP Preview (`geoviz-gycc07baz-agentboard.vercel.app/mcp`,
commit `83a1386`) was validated in ChatGPT developer mode on 2026-10-03 — the
operator ran the private test prompts (real site, metadata IP, invalid URL,
"does ChatGPT recommend this business?") and reported all passed. Scoring v1.1 on
Preview `geoviz-nbxw3blb7` (commit `5eb2b0e`) also passed the operator's ChatGPT
smoke test (geoviz.ai 58/100, online, location "Not applicable"). Scoring v1.2 on
Preview `geoviz-djb1m8xsx` (commit `f1b4c0d`) passed the operator's final ChatGPT
test: geoviz.ai 53/100, classified online, location "Not applicable",
structured data shown as "Organization & product schema", recommendations
consistent with the findings, and the result card rendered in ChatGPT.

## What it is
One read-only MCP tool, `check_business_visibility`, served at `/mcp`
(Streamable HTTP, stateless JSON mode, `@modelcontextprotocol/sdk`). It runs the
existing free `/check` analysis (`runFreeCheckDetailed` → `deriveChecks`) on a
business homepage and returns the same score, findings, and fixes, plus factual
evidence lines read from the analyzer signals. It is labeled a **website
AI-readiness check**; `aiSystemsQueried` is always `[]` and every result carries
the disclaimer that no AI system was asked about the business.

| Piece | File |
|---|---|
| Route | `src/app/mcp/route.ts` (POST only, 64 KB body cap, GET/DELETE 405) |
| Server + tool + card registration | `src/lib/chatgpt-plugin/server.ts` |
| Tool logic (validation, limits, output) | `src/lib/chatgpt-plugin/check-business-visibility.ts` |
| SSRF-safe fetcher (wraps monitoring `safeFetch`; shared with `/check`) | `src/lib/free-check/safe-html-fetcher.ts` |
| Result card (MCP Apps `text/html;profile=mcp-app`) | `src/lib/chatgpt-plugin/result-card.ts` |
| Tests (DB-free) | `scripts/test-chatgpt-plugin.ts` (`npm run test:chatgpt-plugin`) |

`/api/free-check` now retrieves websites through the same SSRF-safe fetcher
(`CHECK_ROUTE_FETCH_OPTIONS`: 10 s / 5 MB homepage, cross-site redirects
followed with every hop re-validated; the ChatGPT tool stays same-site only,
8 s / 1.5 MB). Scoring is shared, so v1.1/v1.2 (below) apply to both. Tests:
`scripts/test-free-check-safe-fetch.ts`.

**Rick's 5-vs-60 discrepancy (resolved).** Node's built-in `fetch` always sends
`sec-fetch-mode: cors` and `accept-language: *`; ricksaffordableheating.com
answers those with its client-side app shell (5.9 KB, no JSON-LD) instead of
the prerendered page (39 KB, 2 JSON-LD blocks). `safeFetch`'s node:https
transport sends neither, so `/check` now scores the real page (5 → 60).

## Free-check scoring v1.1 (local vs. online)
`deriveChecks` first runs `classifyBusinessType` (`src/lib/free-check/classifyBusinessType.ts`).
Local is the default and any local signal wins (LocalBusiness-family `@type`,
address/geo/openingHours in schema, or a street address on the page). Otherwise
the site is **online** when it has a `SoftwareApplication` / `WebApplication` /
`MobileApplication` / `OnlineBusiness` / `OnlineStore` type, an online category,
or 3+ online product cues in the homepage text. For online sites:
`location_clarity` is `not_applicable` and excluded from the overall score
(weights renormalized over the other five), and structured data is scored on
name/url/telephone only. Local scoring is byte-for-byte v1.0 (pinned in
`scripts/lib/free-check-v1-0-baseline.json`). Results carry `businessType`,
`businessTypeReasons`, and `scoringVersion`.

**v1.2** (`free-check-v1.2`): online structured data is scored on a 6-item
checklist (`src/lib/free-check/onlineSchema.ts`): Organization name, url, and
logo/sameAs; a WebSite node; a product node (`SoftwareApplication`,
`WebApplication`, `MobileApplication`, `Product`, `Service`) with a name and
with applicationCategory/offers/description. The check is labeled
"Structured data / Organization & product schema" for online sites and keeps
"Structured data / LocalBusiness schema" for local ones. Fix wording names only
what its own check measures, and the readiness fix lists only its weak inputs, so
no top improvement restates a Strong finding (enforced by a consistency test).

## Submission-readiness changes (branch `feat/chatgpt-plugin-submission`)
- **Links:** tool results link only to non-transactional pages: `links.freeCheck` (`/check`) and `links.exampleReport` (`/sample-report`). The card reads "See an example GeoViz report". There is no `/order` or checkout link, per OpenAI's plugin commerce rules.
- **Cache:** fetched public pages are cached in memory for 10 minutes per URL (`src/lib/chatgpt-plugin/fetch-cache.ts`). Repeat checks re-score the cached pages without a new request and don't count toward the per-site or global limits.
- **Pages:** `/support` added. `/privacy#chatgpt` documents the plugin's data, purpose, retention, sharing and contact.
- **Package:** the submission package and audit are in `chatgpt-plugin/`.

## Safety
- http/https on 80/443 only, no URL credentials; every DNS answer and connect-time
  address must be public (private, loopback, link-local/metadata, CGNAT, ULA,
  IPv4-mapped, NAT64 blocked); same-site redirects only (max 3, re-validated).
- Homepage 8 s / 1.5 MB, robots.txt + sitemap.xml 5 s / 512 KB, whole tool 20 s.
- Rate limits (in-memory, per instance): 10 per client IP hash, 3 per target
  domain, 60 global — per 10 minutes.
- No database, email, customer data, audit data, Stripe, or AI-provider calls.
  Logs carry only tool, normalized domain, outcome, duration, and IP hash.

## Before public submission
- Verified OpenAI organization; submit via the plugin submission portal.
- Production-domain endpoint (e.g. `https://www.geoviz.ai/mcp`), not a Preview.
- Privacy policy section covering what the tool processes (the URL, optional
  name/city/state; nothing stored).
- Plugin package: `plugin.json` (with `extensions.com.openai` metadata) +
  `mcp.json`; logo; description; test prompts with expected responses;
  screenshots of the card; justification for each annotation.
- `_meta.ui.domain` for the card, if review requires a dedicated widget origin.
- Durable shared rate limit (DB or KV) instead of per-instance memory.
- `/check` behavior change to review: a homepage that answers with a non-2xx
  status, a non-HTML content type, or more than 5 MB is now reported as
  unreachable instead of being scored.
