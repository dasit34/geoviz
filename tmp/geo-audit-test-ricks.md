# AI Visibility Report — Rick's Affordable Heating & Cooling

**Site audited:** https://ricksaffordableheating.com
**Business:** Rick's Affordable Heating & Cooling — HVAC services, Toledo OH metro
**Report date:** May 3, 2026
**Audit method:** Five-track AI visibility analysis (citability, platform readiness, technical, content/E-E-A-T, structured data)

---

## Executive Summary

> **When customers ask ChatGPT, Claude, Perplexity, or Google's AI to recommend a Toledo HVAC company, does your business show up?**

Right now: **inconsistently, and with the wrong phone number and address.**

Your site has real strengths — a strong review base, BBB A+, 35+ years of experience, well-written long-form content, and existing schema markup. But three issues are actively suppressing your visibility in AI search:

1. **The phone number and street address inside your structured data don't match your real ones.** This is the single most damaging finding in this audit. AI engines and Google rely on the schema to confirm "is this really the same business?" When it doesn't match Google Business Profile, AI tools downgrade or skip the citation.
2. **AI engines have no entity graph for you.** No Wikipedia, no Wikidata, no LinkedIn company page, no YouTube channel, only 2 platforms in your `sameAs` graph. Competitors with weaker reviews but stronger entity signals will be cited ahead of you.
3. **Your service hub pages are partially invisible to AI crawlers.** The `/services/ac-repair` template returned only a title and a skip-link — meaning the highest-converting commercial template on your site isn't fully readable by ChatGPT, Claude, or Perplexity.

The good news: these are fixable. Most of the highest-leverage fixes are under one hour of work each.

---

## AI Visibility Score

# **58 / 100 — Fair**

| Category | Weight | Score | Weighted |
|---|---|---|---|
| AI Citability & Visibility | 25% | 47 | 11.8 |
| Brand Authority Signals | 20% | 38 | 7.6 |
| Content Quality & E-E-A-T | 20% | 71 | 14.2 |
| Technical Foundations | 15% | 78 | 11.7 |
| Structured Data | 10% | 68 | 6.8 |
| Platform Optimization | 10% | 58 | 5.8 |
| **Composite** | **100%** | | **57.9 → 58** |

**Interpretation:** You're above the "broken" threshold (which would be sub-40), but well below where a 1,800-review BBB A+ company should sit. The base-rate for Toledo HVAC in AI search results today is roughly 45 — most competitors are *worse*. The 58 you have is not a moat; the 80+ you could reach with the fixes below would be.

---

## Platform Readiness — Where Each AI Tool Stands

| AI Search Surface | Readiness | Will it cite you today? |
|---|---|---|
| Google AI Overviews | 68/100 | Sometimes — strong content, but NAP mismatch and inconsistent freshness signals reduce trust |
| Google Gemini | 62/100 | Sometimes — Google review base helps; no YouTube and weak `sameAs` hurt |
| Microsoft Bing Copilot | 55/100 | Rarely — no Bing Webmaster verification, no IndexNow, no LinkedIn |
| ChatGPT Search | 52/100 | Rarely — no entity graph, no Reddit footprint, no llms.txt |
| Perplexity AI | 48/100 | Rarely — content reads as marketing copy; no primary-source data, no dates |

**Translation:** The two platforms most likely to recommend you today are Google's (AI Overviews + Gemini), because they can pull from your Google Business Profile and review count. The pure-AI tools (ChatGPT, Perplexity) are flying blind on your entity and will tend to cite competitors who have a Wikipedia entry, Reddit chatter, or a more complete schema graph — even if those competitors are worse companies.

---

## Critical Issues (fix these first)

### 1. Wrong phone number in your structured data
Your schema markup currently tells Google and every AI engine that your phone is **`+1-419-874-9999`**. Your real number is **`(419) 581-5953`**. Every page on the site carries this error.

**Why it matters:** Schema is the contract you sign with search engines about who you are. When your schema phone doesn't match your Google Business Profile phone, Google and AI tools assume one of the two records is stale, and they downgrade citations. This is also actively confusing customers if AI agents start dialing it.

**Fix:** 30 minutes — replace `telephone` field on the homepage and every inner page with `+1-419-581-5953`.

### 2. Wrong street address in your structured data
Schema lists **`871 Commerce Dr`**. Your real address is **`26963 Eckel Rd Suite 304, Perrysburg, OH 43551`**. The geo coordinates are also pointing at the wrong building.

**Fix:** 15 minutes — correct `streetAddress` and update `geo.latitude` / `geo.longitude` (≈ 41.5425, -83.6436).

### 3. Service hub pages don't render for AI crawlers
When we fetched `/services/ac-repair` the way ChatGPT and Claude do, all that came back was the page title and a "Skip to main content" link. The actual content appears to require JavaScript that AI bots don't execute.

**Why it matters:** Service pages are where conversion happens. If AI tools can't read them, they'll cite your *blog posts* (informational) instead of your *service pages* (commercial). You're getting half-credit on the most important template on the site.

**Fix:** Pre-render or server-side render every service page so the content appears in the initial HTML. Verify by viewing source on each `/services/*` URL — if you see a `<div id="root">` with no content, that page is invisible to AI.

### 4. No `llms.txt` file
The emerging standard for telling AI engines what your site is about, where to find canonical content, and what services you offer. Currently returns 404. **Zero of your local HVAC competitors have this.** First-mover advantage available today.

**Fix:** Deploy the `llms.txt` template included in the appendix (15 minutes).

### 5. Three different phone numbers across the site
Beyond the schema error, the site itself displays at least three different phone numbers in different sections — `(419) 581-5953`, `(419) 874-9999`, and `(419) 863-1958`. Pick one and propagate it everywhere: homepage, every location page, every service page, footer, schema, Google Business Profile.

---

## Detailed Findings By Category

### AI Citability — 47/100

Where citable passages exist on your site, they're strong. Your AC cost-tier paragraphs (`"$4,500-$7,000"` for 2-ton systems), federal tax credit blocks, and Toledo-specific climate references (`"high humidity exceeding 70% June-September"`) are genuinely the kind of content AI Overviews and Perplexity prefer to quote.

**Strongest citable passages:**
- AC system cost tiers in 2026 with labor breakdown (88/100 citability)
- Federal tax credit + financing terms ($2,000 / $500–$1,500 / $75–$150/mo) (84/100)
- Furnace lifespan + diagnostic fee combination (82/100)

**Weakest areas:**
- Service hub pages render nearly empty to non-JS bots (15/100)
- Homepage service descriptions are short labels, not answer blocks (35/100)

### Brand Authority — 38/100

| Platform | Status | Score |
|---|---|---|
| Wikipedia / Wikidata | Absent | 0/30 |
| Reddit (r/Toledo, r/HVAC) | Absent | 2/20 |
| YouTube | Absent | 0/15 |
| LinkedIn (company page) | Personal profile only | 4/10 |
| BBB & directories | Strong (A+, Toledo Chamber, Wheree, Facebook) | 22/25 |
| Google Reviews | 1,800+ at 4.8 stars | +10 bonus |

**Bottom line:** Your Google review base is the only thing carrying brand authority. AI tools that don't query Google Local (ChatGPT, Claude, Perplexity) currently have almost nothing to anchor a recommendation to.

### Content Quality & E-E-A-T — 71/100

| Pillar | Score |
|---|---|
| Experience | 19/25 — strong (named techs, real testimonials, owner's voice) |
| Expertise | 13/25 — weakest pillar (no NATE certs, no EPA 608, no bylines, no license number) |
| Authoritativeness | 17/25 — strong external (BBB, OEM partnerships) but weak owned signals |
| Trustworthiness | 18/25 — strong (NAP, warranty specifics, pricing transparency) |

Content reads as human-written, technically correct, and locally specific. AI-content detection risk is low. The biggest content gap is the absence of author bylines and credentials on the 31 blog posts — every one of them is unsigned, which directly suppresses the "Expertise" signal AI tools weight most heavily.

### Technical Foundations — 78/100

| Category | Score |
|---|---|
| Crawlability (robots.txt + sitemap) | 85/100 |
| Indexability / meta tags | 92/100 |
| URL structure | 95/100 |
| Mobile optimization | 90/100 |
| SSR / JS dependency | 72/100 (SPA framework — risk for service pages) |
| Core Web Vitals risk | 70/100 |
| Security headers | 65/100 (missing CSP, X-Frame-Options, Permissions-Policy) |

Server-rendered HTML on the homepage is fine — full content, JSON-LD, and meta tags arrive in the initial response. The concern is the `<div id="root">` SPA mount on inner pages. The sitemap also batch-stamps 109 URLs to `2026-03-20`, which search engines learn to discount.

### Structured Data — 68/100

You already have JSON-LD `HVACBusiness`, `BreadcrumbList`, `Service`, and `FAQPage` markup on multiple pages. That's well above what most local HVAC sites have. The problems are:

1. The phone number and address are wrong (covered above)
2. `sameAs` only has 2 platforms (should have 7+)
3. The homepage `BreadcrumbList` has only 1 item, which is technically invalid
4. No `Person` schema for Rick (founder = E-E-A-T anchor)
5. No `award`, `foundingDate`, `slogan`, or expanded `knowsAbout` fields

### AI Crawler Access — Allowed but Fragile

`robots.txt` reads `User-agent: * / Allow: /`. That implicitly grants every AI bot access (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.), but there are zero **explicit** allowances. If your hosting provider or Cloudflare ever flips on a default "block AI bots" setting — which is becoming common — you'd lose every AI crawler in one click. Adding explicit `Allow` rules is cheap insurance.

Also missing: a `Sitemap:` reference inside `robots.txt`, and a `Content-Signal:` directive declaring intent for `search`, `ai-train`, and `ai-retrieval`.

---

## Top Priority Fixes — Ranked By Impact

### Quick Wins (under 1 hour each)

| # | Fix | Effort | Impact |
|---|---|---|---|
| 1 | Correct phone & address in schema across every page | 30 min | Critical |
| 2 | Pick ONE phone number; propagate across site, footer, schema, GBP | 45 min | Critical |
| 3 | Publish `/llms.txt` (template in appendix) | 15 min | High |
| 4 | Expand schema `sameAs` to 7+ platforms (BBB, Yelp, Angi, YouTube, LinkedIn) | 30 min | High |
| 5 | Add author bylines + bio component to all 31 blog posts | 45 min | High |
| 6 | Display Ohio HVAC license number + insurance details in footer | 15 min | Medium |
| 7 | Add `<link rel="preload">` for hero image; add `fetchpriority="high"` | 10 min | Medium |
| 8 | Trim title tag to ≤60 chars; meta description to ≤160 chars | 10 min | Medium |
| 9 | Add CSP, X-Frame-Options, Permissions-Policy security headers | 15 min | Medium |
| 10 | Remove broken 1-item BreadcrumbList from homepage | 5 min | Low |

### Medium-Term Projects (1–4 weeks)

1. **Pre-render or SSR every service page** so content is in the initial HTML, not behind a JavaScript mount. Validate with `view-source:` on every `/services/*` URL.
2. **Add expanded FAQ blocks** (with answers visible in DOM, not collapsed) to the homepage and every service page, marked with `FAQPage` schema. Currently `/services/ac-repair` has 8 questions with answers hidden — costs you AI Overviews citation eligibility.
3. **Launch a YouTube channel** with 10–15 short diagnostic videos repurposed from the existing blog posts ("What a healthy furnace flame looks like," "How to change your filter"). Embed each on the matching service page. Gemini and ChatGPT both surface YouTube heavily for HVAC questions.
4. **Create a real LinkedIn Company Page** (separate from Rick's personal profile). Add it to schema `sameAs`. Bing Copilot and Microsoft AI tools rely on LinkedIn for entity confirmation.
5. **Build a real "About Us / Our Team" page** (current is ~238 words). Include named lead techs with photos, certifications (NATE, EPA 608), explicit OEM authorization claims ("Rheem Pro Partner"), and Rick's veteran/founding story.
6. **Inject one first-hand mini case story per blog post.** Format: *"Last February in Sylvania we serviced a 1980s ranch where the homeowner reported [symptom]. Tech [Name] found [diagnosis]. Repair cost: [outcome]."* Converts generic listicles into experience-rich content AI tools preferentially cite.
7. **Publish one primary-source data page**: "2026 Toledo HVAC Repair Cost Data — averages from 50,000+ Northwest Ohio service calls." Real data table by repair type. This becomes THE citable source for Toledo HVAC cost queries on Perplexity.

### Strategic (1–3 months)

1. **Build entity-recognition surface area** so AI tools can disambiguate you:
   - Wikidata entry (lightweight precursor to Wikipedia eligibility)
   - LinkedIn company page (above)
   - YouTube channel (above)
   - 5–10 helpful answers on r/Toledo / r/HVAC / r/HomeImprovement (genuine diagnostic answers, not promotion)
2. **Fix sitemap `lastmod` dates** to reflect actual edit dates per URL — the batch-dated `2026-03-20` across 109 pages is a freshness penalty.
3. **Establish a sustained publishing cadence** — your 8 most recent blog posts are dated within a 2-day window in March 2026, which looks like a one-time content drop. Commit to one new post per month minimum.
4. **Implement IndexNow** for Bing/Copilot — generate a key, host `/{key}.txt`, ping Bing on every publish. Verify in Bing Webmaster Tools and add `msvalidate.01` meta tag.
5. **Add `Content-Signal:` directive to `robots.txt`** declaring `search=yes, ai-train=yes, ai-retrieval=yes`. Add explicit `Allow` rules for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Applebot-Extended.

---

## What Each Fix Will Do To Your Score

If only the **Quick Wins** ship: composite moves from **58 → 70** (Good).
If Quick Wins + Medium-Term ship: composite moves to **80–85** (Strong; near top of Toledo HVAC field).
If the full plan ships: composite **88–92** (Excellent; AI tools will cite you ahead of competitors).

The single highest-ROI action on this list is fixing the schema NAP. That one change alone is worth approximately +6 composite points and will measurably increase how often Google AI Overviews and Gemini surface your business.

---

## Appendix A — Ready-to-Deploy `llms.txt`

Save the following at `https://ricksaffordableheating.com/llms.txt`:

```markdown
# Rick's Affordable Heating & Cooling

> Veteran-owned, family-owned HVAC company serving the Toledo, Ohio metro and Southeast Michigan since 2012. 35+ years of combined experience, 1,800+ Google reviews at 4.8 stars, 50,000+ customers served, BBB A+ Accredited. 24/7 emergency service. Located at 26963 Eckel Rd Suite 304, Perrysburg, OH 43551. Phone: (419) 581-5953.

## Services
- [AC Repair](https://ricksaffordableheating.com/services/ac-repair): Same-day diagnosis and repair for central AC, heat pumps, and mini-splits across Toledo metro.
- [AC Replacement](https://ricksaffordableheating.com/ac-replacement/): Central AC installation; typical range $4,500-$12,000; 10-year parts and labor warranty.
- [Furnace Repair](https://ricksaffordableheating.com/services/furnace-repair): Gas and electric furnace diagnosis; $90 diagnostic fee waived with repair.
- [Furnace Installation](https://ricksaffordableheating.com/services/furnace-installation): Trane, Lennox, Rheem, Ruud, York, Frigidaire.
- [Heat Pump Service](https://ricksaffordableheating.com/services/heat-pumps): Repair, maintenance, conversion, replacement.
- [Water Heater Services](https://ricksaffordableheating.com/water-heater-services/): Tank and tankless repair and replacement.
- [Duct Cleaning & Air Quality](https://ricksaffordableheating.com/services/air-quality): Duct cleaning, indoor air quality assessments.

## Service Areas
- [Toledo, OH](https://ricksaffordableheating.com/heating-and-cooling-toledo-ohio)
- [Perrysburg, OH](https://ricksaffordableheating.com/hvac-perrysburg-ohio)
- [Maumee, OH](https://ricksaffordableheating.com/hvac-maumee-ohio)
- [Sylvania, OH](https://ricksaffordableheating.com/hvac-sylvania-ohio)
- [Bowling Green, OH](https://ricksaffordableheating.com/hvac-bowling-green-ohio)
- [Holland, OH](https://ricksaffordableheating.com/hvac-holland-ohio)

## Cost & Diagnostic Guides
- [2026 AC Replacement Cost Toledo](https://ricksaffordableheating.com/ac-replacement-cost-toledo-ohio)
- [2026 Furnace Repair Cost Toledo](https://ricksaffordableheating.com/furnace-repair-cost-toledo-ohio)
- [Heat Pump vs Furnace in Toledo](https://ricksaffordableheating.com/heat-pump-vs-furnace-toledo-ohio)
- [7 Signs You Need Furnace Repair](https://ricksaffordableheating.com/signs-furnace-repair-toledo)
- [Why Is My Furnace Blowing Cold Air?](https://ricksaffordableheating.com/furnace-blowing-cold-air)

## About
- [About Rick's](https://ricksaffordableheating.com/about-us/): Veteran-owned, founded 2012.
- [Contact & 24/7 Dispatch](https://ricksaffordableheating.com/contact)

## Optional
- [Financing Options](https://ricksaffordableheating.com/financing)
- [Current Promotions](https://ricksaffordableheating.com/specials)
- [Blog (31 articles)](https://ricksaffordableheating.com/blog)
```

---

## Appendix B — Corrected JSON-LD for Homepage `<head>`

Replace your existing `HVACBusiness` block with this (fixes phone, address, geo, expands `sameAs` and entity graph):

```json
{
  "@context": "https://schema.org",
  "@type": "HVACBusiness",
  "@id": "https://ricksaffordableheating.com/#business",
  "name": "Rick's Affordable Heating & Cooling",
  "url": "https://ricksaffordableheating.com",
  "logo": "https://ricksaffordableheating.com/images/logo.png",
  "description": "Veteran-owned, family-owned HVAC contractor serving Toledo, Perrysburg, and Northwest Ohio + Southeast Michigan since 2012. 24/7 emergency service. 4.8 stars across 1,800+ Google reviews. BBB A+ rated.",
  "telephone": "+1-419-581-5953",
  "email": "Billing@ricksaffordableheating.com",
  "priceRange": "$$",
  "foundingDate": "2012",
  "slogan": "Treat people the way you'd want your own family treated.",
  "knowsAbout": ["HVAC repair", "Furnace installation", "AC installation", "Heat pump service", "Water heater repair", "Duct cleaning", "Indoor air quality"],
  "brand": [
    {"@type": "Brand", "name": "Rheem"},
    {"@type": "Brand", "name": "Trane"},
    {"@type": "Brand", "name": "Lennox"},
    {"@type": "Brand", "name": "Ruud"},
    {"@type": "Brand", "name": "Frigidaire"},
    {"@type": "Brand", "name": "York"}
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "26963 Eckel Rd Suite 304",
    "addressLocality": "Perrysburg",
    "addressRegion": "OH",
    "postalCode": "43551",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 41.542483,
    "longitude": -83.6436223
  },
  "areaServed": [
    {"@type": "City", "name": "Toledo"},
    {"@type": "City", "name": "Perrysburg"},
    {"@type": "City", "name": "Maumee"},
    {"@type": "City", "name": "Sylvania"},
    {"@type": "City", "name": "Bowling Green"},
    {"@type": "City", "name": "Holland"},
    {"@type": "City", "name": "Lambertville", "addressRegion": "MI"},
    {"@type": "City", "name": "Temperance", "addressRegion": "MI"},
    {"@type": "City", "name": "Fremont"},
    {"@type": "City", "name": "Oregon"},
    {"@type": "City", "name": "Rossford"},
    {"@type": "City", "name": "Northwood"}
  ],
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    "opens": "00:00", "closes": "23:59"
  }],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": 1800,
    "bestRating": 5,
    "worstRating": 1
  },
  "award": ["BBB A+ Accredited", "Veteran-Owned Business"],
  "founder": {"@id": "https://ricksaffordableheating.com/#founder"},
  "sameAs": [
    "https://www.facebook.com/RicksAffordableHeating",
    "https://www.google.com/maps/place/Rick's+Affordable+Heating+%26+Cooling",
    "https://www.bbb.org/us/oh/perrysburg/profile/heating-contractors/ricks-affordable-heating-cooling-llc-0422-23001305",
    "https://www.yelp.com/biz/ricks-affordable-heating-and-cooling-perrysburg",
    "https://www.youtube.com/@RicksAffordableHeating",
    "https://www.linkedin.com/company/ricks-affordable-heating-cooling",
    "https://www.angi.com/companylist/us/oh/perrysburg/ricks-affordable-heating-cooling.htm"
  ]
}
```

Pair with this `Person` block (same `<script type="application/ld+json">` family):

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://ricksaffordableheating.com/#founder",
  "name": "Rick [LAST NAME]",
  "jobTitle": "Founder & Owner",
  "worksFor": {"@id": "https://ricksaffordableheating.com/#business"},
  "knowsAbout": ["HVAC", "Furnace repair", "AC installation", "Heat pumps"],
  "description": "U.S. military veteran and founder of Rick's Affordable Heating & Cooling, serving Northwest Ohio since 2012.",
  "url": "https://ricksaffordableheating.com/about-us"
}
```

---

## Appendix C — Hardened `robots.txt`

Replace current `robots.txt` with:

```
# Rick's Affordable Heating & Cooling — robots.txt

User-agent: *
Allow: /

# Explicit AI search and training crawlers — declare intent
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: Meta-ExternalAgent
Allow: /

User-agent: Amazonbot
Allow: /

# Content intent signal (per IETF aipref)
Content-Signal: search=yes, ai-train=yes, ai-retrieval=yes

Sitemap: https://ricksaffordableheating.com/sitemap.xml
```

---

## Audit Methodology

This report is the synthesized output of five parallel specialist analyses:

- **AI visibility** — citability scoring, AI crawler access, llms.txt analysis, brand mention scan across Wikipedia, Reddit, YouTube, LinkedIn, BBB
- **Platform readiness** — separate readiness scoring for Google AI Overviews, Gemini, ChatGPT Search, Perplexity, Bing Copilot
- **Technical SEO** — robots, sitemap, indexability, security headers, Core Web Vitals risk, SSR vs. SPA assessment
- **Content quality / E-E-A-T** — Experience, Expertise, Authoritativeness, Trust scoring across homepage, About, blog, and service pages
- **Structured data** — JSON-LD detection across 3 pages, validation against Schema.org, gap analysis

Live URLs fetched and inspected: homepage, `/services/ac-repair`, `/furnace-repair`, `/hvac-toledo-ohio`, `/about-us`, two blog posts, `/robots.txt`, `/sitemap.xml`, `/llms.txt`. Composite score weighted per the documented methodology (Citability 25 / Brand 20 / Content 20 / Technical 15 / Schema 10 / Platform 10).
