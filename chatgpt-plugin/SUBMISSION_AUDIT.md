# GeoViz ChatGPT plugin: submission audit

Prepared 2026-10-04 against the current OpenAI plugin docs:
- [submission](https://developers.openai.com/plugins/deploy/submission)
- [submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
- [MCP review requirements](https://developers.openai.com/plugins/deploy/app-review)
- [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [security & privacy](https://developers.openai.com/plugins/guides/security-privacy)

**Status: NOT submitted.** The 3 blockers are **fixed on branch `feat/chatgpt-plugin-submission`**, but not deployed. They become effective only after you merge and deploy to Production; until then, the live site still has the old behavior.

The 4 remaining items need your action in the OpenAI dashboard or a recording; they are listed below.

## Package (`chatgpt-plugin/`)
| File | Purpose |
|---|---|
| `plugin.json` | Package identity + listing metadata (`extensions.com.openai.interface`) |
| `mcp.json` | One MCP server: `geoviz`, `streamable-http`, `https://www.geoviz.ai/mcp` |
| `assets/logo.png` | 512×512 square, rendered from the site mark `src/app/icon.svg` |
| `assets/screenshot-1.png` | 706×545. The real result card filled with this branch's output for geoviz.ai. It's a card render, not a ChatGPT capture. |
| `dist/geoviz-chatgpt-plugin-1.0.0.zip` | `plugin.json` + `mcp.json` + `assets/` (100 KB, 5 entries) |
| `review/review-test-cases.json` | Exactly 5 positive + 3 negative cases, release notes, countries, commerce flag, annotation justifications |
| `review/tools-list.json` | `tools/list` from this branch's MCP server (what Production will expose after deploy) |
| `review/sample-output-geoviz.json` | Tool output for geoviz.ai from this branch's code (used for the screenshot) |

**Scoring v1.3 (branch `feat/free-check-v1-3`):** `plugin.json` (longDescription), the release notes and `review/tools-list.json` are updated for v1.3. The committed ZIP is still the v1.2 build. Rebuild it only after v1.3 is approved and deployed to Production.

Rebuild: `npm run chatgpt-plugin:package`. It validates the listing limits and re-renders the assets and the ZIP.

## Audit results

### Endpoint and listing
| Item | Value | Status |
|---|---|---|
| Production MCP endpoint | `https://www.geoviz.ai/mcp` | ✅ `initialize` 200; one tool; `GET` 405; card resource loads; blocks private/metadata targets |
| Website URL | `https://www.geoviz.ai` | ✅ 200 |
| Support URL | `https://www.geoviz.ai/support` | ✅ on branch (`src/app/support/page.tsx`, also linked from the footer). It returns 404 in Production until deployed. |
| Privacy-policy URL | `https://www.geoviz.ai/privacy` | ✅ on branch. New section "4. GeoViz in ChatGPT" (`/privacy#chatgpt`); last updated October 4, 2026. Live only after deploy. |
| Terms-of-service URL | `https://www.geoviz.ai/terms` | ⚠️ Live; doesn't mention the ChatGPT plugin. Recommended, not required. |
| Plugin name | `geoviz` / display "GeoViz" (6 characters) | ✅ |
| Short description | "Website AI-readiness checks" (27 of 30 characters) | ✅ |
| Long description | 1,262 of 4,000 characters, with no recommendation or ranking claims | ✅ |
| Developer name | "GeoViz" | ⚠️ Must match the **verified** OpenAI organization identity |
| Category | "Business & Operations" | ✅ (valid enum) |
| Capabilities | 4 items, each 120 characters or fewer | ✅ |
| Starter prompts | 1 ("Check whether my business website is ready for AI search and assistants.") | ✅ one screenshot per prompt |
| Brand colors | `#FF6A1A` light and dark: 2.87:1 against white, 5.62:1 against `#212121` (both need at least 2:1) | ✅ |
| Logo | 512×512 PNG, square | ✅ |
| Screenshot | 706 px wide, 545 px tall (rule: exactly 706 wide, 400–860 tall) | ✅. It's a card render; consider replacing it with a real ChatGPT capture at the same size. |
| Tool annotations | `readOnlyHint` true, `destructiveHint` false, `openWorldHint` true, `idempotentHint` true; justifications in `review-test-cases.json` | ✅ |
| Authentication | None; no demo account needed | ✅ |
| Commerce flag | `false` | ✅. But see blocker 1. |
| Test cases | 5 positive / 3 negative | ✅ |
| Release notes, countries | Written; countries `["US"]` | ✅ |
| Demo recording URL | — | ❌ **missing** |
| Domain verification | `https://www.geoviz.ai/.well-known/openai-apps-challenge` | ❌ **404**. The token is issued by the portal after upload, then must be served as plain text. |
| Organization verification | — | ❌ **not confirmed**. Business verification as "GeoViz" in the OpenAI Platform dashboard (owner, or a member with Apps Management Write). |

### Blockers: fixed on this branch (effective after merge and Production deploy)
1. **Transactional link removed.**
   - Tool results no longer contain `/order`. `links` is now `{ freeCheck: /check, exampleReport: /sample-report }`.
   - The card link reads "See an example GeoViz report", and the text summary links the free check and the example report.
   - Tests assert there's no `/order`, checkout, Stripe or price wording in output, text or card.
   - `/sample-report` itself is a marketing page with its own order button. It isn't a checkout page.
   - Note: the public sample reports were generated with an older version and may show outdated content. Consider regenerating them before submission.
2. **Privacy policy covers the plugin**, in `/privacy#chatgpt`:
   - **data received:** the website address, plus optional business name, city and state;
   - **ignored:** ChatGPT request metadata;
   - **purpose:** run the website check;
   - **retention:** results are not stored; fetched pages stay in memory up to 10 minutes; logs are kept no longer than 30 days;
   - **sharing:** Vercel hosting, the checked website and OpenAI; nothing sold;
   - **deletion:** nothing to delete; logs expire;
   - **contact:** `/support` and email.

   ⚠️ Confirm that Vercel runtime-log retention, and any log drains, keep logs 30 days or less, so "no longer than 30 days" stays accurate.
3. **Support page.** `/support` covers audits and orders, GeoViz in ChatGPT (what it does and doesn't do, what to include, how to disconnect), the free check, and privacy requests.

### Rate-limit review risk: mitigated
- Fetched public pages are cached in memory for 10 minutes per URL (bounded at 200 entries and 40 MB).
- A repeat check within that window re-scores the cached pages with that caller's own inputs. It makes no new request to the website and doesn't count toward the per-site limit (3 per 10 minutes) or the global limit.
- The per-client limit (10 per 10 minutes) still applies, and failures are never cached.
- **Limit:** the cache lives in each server instance's memory, so a retry that lands on a different instance fetches again. That's fine at review volume.

### Other missing items
4. Domain-verification token. Generate it in the portal, then serve it at `/.well-known/openai-apps-challenge` (plain text). This needs a small route or static file and a Production deploy; the token can only come from the portal.
5. Organization verification under the publisher name "GeoViz".
6. Demo recording: a short walkthrough of the review cases in ChatGPT, at an accessible URL.
7. Policy attestations: confirmed in the portal at submission time.

### Remaining risks
- **The screenshot isn't a ChatGPT capture.** It's the actual card markup with real output. If review wants in-product images, capture the card in ChatGPT at 706 px wide.
- **The listing's first impression is a 53/100 score for GeoViz's own site.** It's accurate and on-message, but you may prefer to improve the site's WebSite and product schema first.
- **Third-party site in review cases.** Positive case 2 uses ricksaffordableheating.com, a real business, and is seen only by reviewers. Swap it for a local site you own or have permission for, if you prefer.

## Security and privacy checks against the guidelines (all ✅ in Production)
- **Input validation:**
  - URL length 3–500, http(s) only, ports 80/443 only, no credentials in the URL;
  - business name 2–200 characters, city and state at most 100;
  - request body at most 64 KB.
- **SSRF protection:**
  - public IPs only, checked at DNS lookup **and** connect time;
  - loopback, RFC 1918, link-local and metadata, CGNAT, ULA, IPv4-mapped and NAT64 addresses blocked;
  - redirects re-validated on every hop, same-site only for the MCP tool.
- **Limits:** homepage 8 s / 1.5 MB, robots.txt and sitemap 5 s / 512 KB, whole tool 20 s.
- **Data minimization:** no conversation data, no personal data beyond what the user types, no precise location (city and state of the business only), no credentials or payment data.
- **Logs:** tool, domain, outcome, duration and IP hash only. No raw IPs, headers or page content.
- **Widget:** static HTML, no external resources, empty `connectDomains` and `resourceDomains`, no iframes, values rendered with `textContent`.
- **Claims:** fixed disclaimer and `aiSystemsQueried: []`. Tool and listing text never claim AI recommendations, rankings or guarantees.
- **Audience:** general and suitable for ages 13–17; no prohibited content.
