# GeoViz ChatGPT plugin (v1, Preview only)

Status: built on `feat/geoviz-chatgpt-plugin`, deployed only to a Vercel Preview,
tested privately in ChatGPT developer mode. **Not merged, not in Production, not
submitted.**

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
| SSRF-safe fetcher (wraps monitoring `safeFetch`) | `src/lib/chatgpt-plugin/safe-html-fetcher.ts` |
| Result card (MCP Apps `text/html;profile=mcp-app`) | `src/lib/chatgpt-plugin/result-card.ts` |
| Tests (DB-free) | `scripts/test-chatgpt-plugin.ts` (`npm run test:chatgpt-plugin`) |

The `/api/free-check` route is unchanged: the fetcher seam added to
`runFreeCheck` / `auditCrawlability` defaults to the original `fetchRawHtml`.

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
- Separate follow-up: move `/api/free-check` onto the SSRF-safe fetcher.
