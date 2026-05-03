import type { VisibilityReport } from "./types";

/**
 * Builds the customer-facing GEO Foundation Fix deliverable.
 *
 * Auto-fills:
 *   - [Business Name]
 *   - [X/100]
 *   - the "Top Issue" line  ← report.primaryDriver
 *
 * Manual placeholders the consultant fills during fulfillment (these need
 * human knowledge of the customer and aren't safe to guess from the audit):
 *   - [SERVICE], [CITY/REGION], [City1, City2, City3, City4]
 *   - schema body fields (phone, address, hours)
 *   - FAQ specifics ([time range], list of services)
 */
export function generateFixPack(report: VisibilityReport): string {
  const business = report.businessName;
  const score = `${report.overallScore}/100`;
  const topIssue = report.primaryDriver;

  return `GEO VIZ FOUNDATION FIX — ${business}

Current Score: ${score}
Top Issue: ${topIssue}

---

WHAT THIS MEANS

- You are not being recommended when customers ask who to hire
- Competitors are getting those jobs instead
- This is fixable quickly with the changes below

---

FIX #1 — HOMEPAGE HEADLINE (REPLACE)

Replace your current headline with:

[SERVICE] in [CITY/REGION]
Trusted [service] for homeowners in [City1, City2, City3].

---

FIX #2 — SERVICE AREA SECTION (ADD)

Add this section below your homepage:

We provide [service] in [City1, City2, City3, City4] and surrounding areas.
If you’re located in or near these areas, we can help.

---

FIX #3 — FAQ SECTION (ADD)

Add a section at the bottom of your homepage:

Q: How much does [service] cost?
A: Pricing depends on the scope. Contact us for a fast quote.

Q: Do you serve [City]?
A: Yes, we serve [City] and surrounding areas.

Q: How long does it take?
A: Most jobs are completed within [time range].

Q: What types of [service] do you offer?
A: We handle [list services].

Q: How do I get started?
A: Call us or request a quote online.

---

FIX #4 — ADD SCHEMA (PASTE)

Paste this into your site header:

\`\`\`html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "${business}",
  "url": "${report.websiteUrl || "[https://yourdomain.com]"}",
  "telephone": "[+1-555-555-5555]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Street]",
    "addressLocality": "[City]",
    "addressRegion": "[State]",
    "postalCode": "[ZIP]",
    "addressCountry": "US"
  },
  "areaServed": ["[City1]", "[City2]", "[City3]"],
  "description": "[Service] in [City]. Call ${business} for fast, reliable service."
}
</script>
\`\`\`

(No edits needed — copy and paste exactly. Replace the bracketed values during onboarding.)

---

FIX #5 — META TITLE + DESCRIPTION (REPLACE)

Title:
[Service] in [City] | ${business}

Description:
[Service] in [City]. Call ${business} for fast, reliable service.

---

FIX #6 — IMAGE DESCRIPTIONS (ADD)

Add these to your images:

- [Service] in [City] home
- Before and after [service] project
- [Service] completed in [City]
- Residential [service] example
- Professional [service] work

(Add to at least 5–10 images.)

---

EXPECTED RESULT

- Your site becomes easier for AI to understand
- You increase your chances of being recommended
- Your score should improve significantly

---

WANT US TO HANDLE THIS FOR YOU?

You don’t need to figure this out — we fix it for you.

- Completed in ~24 hours
- Implemented safely (no site risk)
- Before & after score included

Cost: $497

---

HOW TO IMPLEMENT (QUICK GUIDE)

WordPress:
- Edit homepage → replace text
- Add sections
- Use WPCode to paste schema
- Use Yoast/RankMath for meta

Wix / Squarespace:
- Edit homepage → replace text
- Add section blocks
- Paste schema in custom code
- Update SEO settings
`;
}
