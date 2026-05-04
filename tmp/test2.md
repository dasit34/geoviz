# GEO Audit Report — example.com

**Audit Date:** 2026-05-03
**Target URL:** https://example.com
**Business Type:** Reserved Documentation Domain (IANA / RFC 2606)
**Composite GEO Score:** **30 / 100 — Critical**

> **Important context:** example.com is the IANA-reserved placeholder domain defined by RFC 2606. It exists solely so writers, developers, and standards documents have a safe domain to reference. This audit applies commercial GEO methodology to a non-commercial target. The findings below are accurate against the rubric, but the recommended actions are deliberately not actionable for the actual operator (ICANN/IANA). They illustrate what a real business site at this URL would need to do.

---

## 1. Executive Summary

example.com receives a composite score of **30/100**, placing it in the **Critical** band. The site is functionally invisible to AI search because it offers no content for AI engines to extract, cite, or paraphrase. Its single saving grace is a strong entity footprint on Wikipedia, Wikidata, and the IANA registry — which is why brand authority does not score zero.

**Top three weaknesses:**
1. **No extractable content** (~14 words on page) — content score 8/100.
2. **No structured data** — schema score 0/100.
3. **No platform-specific optimization** — average platform readiness 7/100 across Google AIO, ChatGPT, Perplexity, Gemini, and Bing Copilot.

**Top strength:** Solid technical fundamentals (62/100). The page is fully server-rendered static HTML with HTTPS/2, sub-1KB payload, and zero JavaScript, so what little exists is 100% crawlable by GPTBot, ClaudeBot, PerplexityBot, and traditional search bots.

---

## 2. Composite Score Breakdown

| Category | Weight | Score | Weighted |
|---|---:|---:|---:|
| AI Citability & Visibility | 25% | 28 / 100 | 7.0 |
| Brand Authority Signals | 20% | 50 / 100 | 10.0 |
| Content Quality & E-E-A-T | 20% | 14 / 100 | 2.8 |
| Technical Foundations | 15% | 62 / 100 | 9.3 |
| Structured Data | 10% | 0 / 100 | 0.0 |
| Platform Optimization | 10% | 7 / 100 | 0.7 |
| **Composite GEO Score** | **100%** | | **~30 / 100** |

| Band | Range | Result |
|---|---|---|
| Excellent | 85–100 | |
| Good | 70–84 | |
| Fair | 50–69 | |
| Poor | 30–49 | ← |
| Critical | 0–29 | |

---

## 3. AI Citability & Visibility — 28 / 100

### Citability — 22 / 100
The page contains exactly one substantive content block:
> "This domain is for use in documentation examples without needing permission. Avoid use in operations."

| Factor | Score |
|---|---:|
| Answer block quality | 60 |
| Self-containment | 70 |
| Structural readability | 30 |
| Statistical density | 0 |
| Uniqueness | 40 |

There is no FAQ, no how-to content, no proprietary data, no defined-term blocks. AI engines can extract the single sentence and nothing more.

### AI Crawler Access — 50 / 100
`/robots.txt` returns **404**. By absence-of-rules, all major AI crawlers are permitted:

| Crawler | Status |
|---|---|
| GPTBot, OAI-SearchBot, ChatGPT-User | Allowed (default) |
| ClaudeBot | Allowed (default) |
| PerplexityBot | Allowed (default) |
| Google-Extended | Allowed (default) |
| Bytespider, Applebot-Extended, CCBot, Amazonbot, Cohere-ai | Allowed (default) |

This is "permissive by absence" rather than "intentionally optimized." There is no `Sitemap:` directive and no `Content-Signal:` policy.

### llms.txt — 0 / 100
`/llms.txt` returns **404**. No `llms-full.txt` either.

### Brand Mention Presence — 50 / 100

| Platform | Status | Notes |
|---|---|---|
| Wikipedia | Present | Dedicated article (`/wiki/Example.com`) covering RFC 2606, IANA, DNSSEC, 2025 redesign |
| Wikidata | Present | Q1517655 |
| IANA | Present | Canonical reservation registry entry |
| Reddit | Minimal | Incidental placeholder usage only |
| YouTube | Absent | No official channel |
| LinkedIn | Absent | No official IANA-operated company page for the domain |
| Domain/Networking press | Present | RFC 2606, ICANN, OpenSRS, Duck Alignment Academy, DomainGang |

The Wikipedia anchor is unusually strong — but cannot rescue a page with no extractable content.

---

## 4. Brand Authority Signals — 50 / 100

example.com benefits from **encyclopedic entity recognition** disproportionate to its content depth. AI models reliably resolve "example.com" as the canonical IANA reserved documentation domain because Wikipedia, Wikidata, IANA, and RFC 2606 reinforce the identity.

What it lacks:
- No `sameAs` schema on the page itself, so the entity signals exist *off-page* but are never *self-declared* by the site.
- No social, video, or community footprint anchored back to the URL.
- No first-party content backing the entity.

---

## 5. Content Quality & E-E-A-T — 14 / 100

| Dimension | Score (out of 25) |
|---|---:|
| Experience | 1 |
| Expertise | 2 |
| Authoritativeness | 8 |
| Trustworthiness | 3 |

| Metric | Value |
|---|---|
| Word count | ~14 words |
| Headings | 1 H1 ("Example Domain") |
| Internal links | 0 |
| External links | 1 (iana.org) |
| Images | 0 |
| Author byline | None |
| Publication / updated date | None visible |
| Contact / privacy / editorial policy | None |

**AI content assessment:** Highly likely human-authored — pre-dates modern LLMs and patterns of AI-generated text.

**Topical authority:** Minimal and intentionally so. The page is definitional of itself only.

---

## 6. Technical Foundations — 62 / 100

| Sub-category | Score | Status |
|---|---:|---|
| Server-side rendering | 100 | Pass |
| Core Web Vitals risk | 95 | Pass |
| Mobile optimization | 80 | Pass |
| URL structure | 100 | Pass |
| Response & status | 90 | Pass |
| Meta tags & indexability | 35 | Fail |
| Crawlability discovery | 30 | Fail |
| Security headers | 35 | Fail |
| Misc. (OG, Twitter, hreflang) | 50 | Warn |

**Pass highlights:**
- 200 OK over HTTPS/2 via Cloudflare; `last-modified` set; `Allow: GET, HEAD`.
- Fully static HTML (~1 KB), zero JS, no render-blocking resources.
- LCP, INP, and CLS risk all minimal.
- `<html lang="en">` and viewport tag present.

**Failures:**
- `/robots.txt` → 404
- `/sitemap.xml` → 404
- No `<meta name="description">`
- No `<link rel="canonical">`
- Title is the literal string "Example Domain" (14 chars, generic)
- Missing HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`
- No Open Graph / Twitter Card / hreflang

---

## 7. Structured Data — 0 / 100

**Schema blocks detected:** 0 (no JSON-LD, no Microdata, no RDFa).

| Schema | Status | GEO Impact |
|---|---|---|
| Organization + sameAs | Missing | Critical |
| WebSite | Missing | Low–Medium |
| WebPage | Missing | Medium |
| speakable | Missing | Medium |
| BreadcrumbList | Missing | Low |
| Article / Person | Missing | N/A |

### Recommended JSON-LD Templates

**Organization (entity identity):**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Internet Assigned Numbers Authority (IANA)",
  "alternateName": "Example Domain",
  "url": "https://example.com",
  "description": "example.com is a reserved domain managed by IANA for use in documentation and illustrative examples.",
  "sameAs": [
    "https://en.wikipedia.org/wiki/Example.com",
    "https://www.wikidata.org/wiki/Q1517655",
    "https://www.iana.org/domains/example",
    "https://datatracker.ietf.org/doc/html/rfc2606"
  ]
}
```

**WebSite:**
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Example Domain",
  "url": "https://example.com",
  "description": "Reserved documentation domain per RFC 2606. Not for operational use.",
  "publisher": { "@type": "Organization", "name": "IANA", "url": "https://www.iana.org" },
  "inLanguage": "en"
}
```

**WebPage with speakable:**
```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Example Domain",
  "url": "https://example.com",
  "description": "This domain is for use in documentation examples without needing permission.",
  "about": {
    "@type": "Thing",
    "name": "Reserved documentation domain",
    "sameAs": "https://en.wikipedia.org/wiki/Example.com"
  },
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": ["h1", "p"]
  }
}
```

---

## 8. Platform Optimization — 7 / 100

| Platform | Score | Top Blocker |
|---|---:|---|
| Google AI Overviews | 8 | No question-format headings, no answerable content |
| ChatGPT Web Search | 12 | No Organization `sameAs` to consolidate Wikipedia entity |
| Perplexity AI | 5 | No primary research, no community endorsement signals |
| Google Gemini | 6 | No Google ecosystem presence (YouTube, GBP, Knowledge Panel) |
| Bing Copilot | 4 | No `msvalidate.01`, no IndexNow key, no LinkedIn |

**Strongest:** ChatGPT Web Search (12) — residual entity weight from Wikipedia.
**Weakest:** Bing Copilot (4) — zero Microsoft-ecosystem signals.

**Cross-platform leverage points:**
1. `sameAs` schema linking Wikipedia + Wikidata — moves ChatGPT, Gemini, Perplexity simultaneously.
2. Question-format H2s with concise answer paragraphs — moves Google AIO + ChatGPT + Perplexity.
3. Visible publication and `last-modified` dates — moves ChatGPT, Perplexity, Gemini.

---

## 9. Findings by Severity

### Critical
- Page contains ~14 words of extractable content; AI engines have nothing to cite.
- Zero structured data — no entity declaration, no page semantics, no `sameAs`.
- Average platform readiness 7/100 across all five major AI search surfaces.

### High
- `/robots.txt` returns 404 (no `Sitemap:`, no explicit AI crawler allow-list).
- `/sitemap.xml` returns 404.
- No `<meta name="description">` and no `<link rel="canonical">`.
- No `/llms.txt` file.
- Generic 14-character title.

### Medium
- No HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- No Open Graph or Twitter Card tags.
- No author, publication date, or trust signals (contact, privacy, editorial policy).
- No internal linking, no topical depth.

### Low
- No `X-Frame-Options`.
- No hreflang.
- No resource hints (not needed at current size).

---

## 10. Prioritized Action Plan

> All actions below are presented as if a real business owned this URL. example.com itself is reserved by IANA and intentionally minimal — these are not recommendations for ICANN.

### Quick Wins (≤ 1 day, high impact)
1. **Publish `/robots.txt`** with explicit `Allow:` for `GPTBot`, `ClaudeBot`, `PerplexityBot`, `OAI-SearchBot`, `Google-Extended`, plus `User-agent: *` `Allow: /`, plus a `Sitemap:` line.
2. **Publish `/sitemap.xml`** listing every canonical URL with current `<lastmod>`.
3. **Publish `/llms.txt`** with H1 site name, blockquote description, and `## Documentation` linking key pages.
4. **Add `<meta name="description">`, `<link rel="canonical">`, and a more descriptive `<title>`** (50–60 chars, includes primary entity).
5. **Add baseline JSON-LD** — `Organization` with `sameAs` to Wikipedia, Wikidata, LinkedIn, and primary social profiles.

### Medium-Term (1–4 weeks)
6. **Add WebPage schema with `speakable`** marking H1 and primary answer paragraphs.
7. **Add Open Graph + Twitter Card tags** for AI assistants and social previews.
8. **Add baseline security headers** at the edge: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
9. **Restructure content with question-format H2s** followed by 40–60 word answer paragraphs (lifts Google AIO, ChatGPT, Perplexity simultaneously).
10. **Implement IndexNow** — host `{key}.txt` at the domain root and POST URL changes to `api.indexnow.org/indexnow` (low-effort win for Bing Copilot).

### Strategic (1–3 months)
11. **Build first-party content depth** — minimum 1,500-word substantive pages with named author, credentials, publication dates, citations, and inline data.
12. **Establish entity consistency** — official LinkedIn, YouTube, and Google Business Profile, all linked back via `sameAs` schema.
13. **Publish original primary research** (proprietary data, benchmarks, first-hand documentation) to earn the community endorsement signals Perplexity weights heavily.
14. **Build topical hub structure** — 5–10 supporting cluster pages with internal linking that reinforce the primary entity.
15. **Add editorial standards page, visible bylines, and trust infrastructure** (contact, privacy, methodology) — minimum bar for E-E-A-T.

---

## 11. Methodology

| Phase | Action |
|---|---|
| Discovery | Fetched homepage HTML, identified business type (reserved domain), enumerated discoverable URLs |
| Parallel analysis | Five subagents — AI visibility, platform readiness, technical SEO, content/E-E-A-T, structured data |
| Synthesis | Composite score weighted per the GEO rubric (Citability 25 / Brand 20 / Content 20 / Technical 15 / Schema 10 / Platform 10) |

**Sources consulted:**
- example.com (live HTML, headers, robots.txt, sitemap.xml, llms.txt)
- en.wikipedia.org/wiki/Example.com
- iana.org/domains/example
- RFC 2606 (datatracker.ietf.org/doc/html/rfc2606)
- contentsignals.org (draft `Content-Signal:` directive)

## 12. Glossary

- **GEO** — Generative Engine Optimization. Optimizing for AI-powered search (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews).
- **Citability** — How readily an AI engine can extract a self-contained passage and quote or paraphrase it.
- **llms.txt** — Emerging standard for declaring AI-readable documentation structure at the site root.
- **sameAs** — Schema.org property declaring equivalent identifiers across platforms (Wikipedia, Wikidata, LinkedIn).
- **speakable** — Schema.org marker identifying which sections AI assistants should read aloud or treat as primary answer.
- **IndexNow** — Open protocol (Bing/Yandex/others) for instantly notifying search indexes of URL changes.
- **E-E-A-T** — Experience, Expertise, Authoritativeness, Trustworthiness (Google's content quality framework).
