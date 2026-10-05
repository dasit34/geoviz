# GeoViz ChatGPT plugin: submission audit

Prepared 2026-10-04 against the current OpenAI plugin docs:
- [submission](https://developers.openai.com/plugins/deploy/submission)
- [submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
- [MCP review requirements](https://developers.openai.com/plugins/deploy/app-review)
- [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [security & privacy](https://developers.openai.com/plugins/guides/security-privacy)

**Status: NOT submitted.** The package is ready for review. 3 blockers and 4 other missing items are listed below.

## Package (`chatgpt-plugin/`)
| File | Purpose |
|---|---|
| `plugin.json` | Package identity + listing metadata (`extensions.com.openai.interface`) |
| `mcp.json` | One MCP server: `geoviz`, `streamable-http`, `https://www.geoviz.ai/mcp` |
| `assets/logo.png` | 512×512 square, rendered from the site mark `src/app/icon.svg` |
| `assets/screenshot-1.png` | 706×545. The real result card filled with Production output for geoviz.ai (`review/sample-output-geoviz.json`). It's a card render, not a ChatGPT capture. |
| `dist/geoviz-chatgpt-plugin-1.0.0.zip` | `plugin.json` + `mcp.json` + `assets/` (100 KB, 5 entries) |
| `review/review-test-cases.json` | Exactly 5 positive + 3 negative cases, release notes, countries, commerce flag, annotation justifications |
| `review/tools-list.production.json` | Live `tools/list` from Production |
| `review/privacy-policy-addendum.md` | Draft privacy-policy section for the plugin (not published) |

Rebuild: `npm run chatgpt-plugin:package`. It validates the listing limits and re-renders the assets and the ZIP.

## Audit results

### Endpoint and listing
| Item | Value | Status |
|---|---|---|
| Production MCP endpoint | `https://www.geoviz.ai/mcp` | ✅ `initialize` 200; one tool; `GET` 405; card resource loads; blocks private/metadata targets |
| Website URL | `https://www.geoviz.ai` | ✅ 200 |
| Support URL | `https://www.geoviz.ai/support` | ❌ **404**. No HTTPS support page exists; support is `mailto:support@geoviz.ai` only, and the listing needs an HTTPS URL. |
| Privacy-policy URL | `https://www.geoviz.ai/privacy` | ⚠️ Live, but **doesn't cover the plugin**, and retention isn't a timeline (see blockers) |
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

### Blockers (need a decision or a Production change, not made here)
1. **The tool links to a paid checkout flow.**
   - Every result returns `links.fullAudit` = `https://www.geoviz.ai/order?websiteUrl=…`. The card shows it as "Run the full GeoViz audit", and the text summary includes it.
   - `/order` is the $97 audit order form that leads to Stripe checkout.
   - The guidelines say plugins may conduct commerce only for physical goods and must not "link directly to a checkout or other transactional page".
   - **Fix:** drop `fullAudit` from the tool output and the card, or point it at a non-transactional page such as `/sample-report` or `/check`. This is a code change plus a Production deploy. The screenshot would need re-rendering afterwards.
2. **The privacy policy doesn't cover the plugin.**
   - Requirement: data categories, purposes and **retention timelines**.
   - The current policy (updated 2026-05-11) doesn't mention ChatGPT, the plugin or MCP. Its retention is "a reasonable period".
   - What the tool actually processes:
     - inputs: the website URL, plus optional business name, city and state;
     - logs: the normalized domain, outcome, timing and a hashed client IP;
     - nothing written to the database.
   - The OpenAI conversation itself never reaches GeoViz.
   - **Fix:** publish a plugin section, drafted in `review/privacy-policy-addendum.md`, with concrete log-retention periods that you confirm for Vercel.
3. **There is no HTTPS support page.**
   - **Fix:** publish `https://www.geoviz.ai/support`, a simple page with `support@geoviz.ai` and response expectations, or use another HTTPS support URL you control, and update `supportURL`.

### Other missing items
4. Domain-verification token. Generate it in the portal, then serve it at `/.well-known/openai-apps-challenge` (plain text) through a Production deploy.
5. Organization verification under the publisher name "GeoViz".
6. Demo recording: a short walkthrough of the review cases in ChatGPT, at an accessible URL.
7. Policy attestations: confirmed in the portal at submission time.

### Risks (not listed as blockers, but likely to affect review)
- **The rate limit may trip review testing.**
  - The limit is 3 checks per target domain per 10 minutes, per server instance, held in memory.
  - Review cases 1, 3 and 4 all use geoviz.ai. A reviewer who retries, or ChatGPT calling the tool twice, can get "try again in N minutes".
  - Options: cache each domain's result for about 10 minutes and return it instead of refusing, or raise the per-domain limit. A shared (database or KV) limit would also make the global cap real across instances.
- **The screenshot isn't a ChatGPT capture.** It's the actual card markup with real Production data. If review wants in-product images, capture the card in ChatGPT at 706 px wide.
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
