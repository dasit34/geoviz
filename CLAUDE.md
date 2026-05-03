# GeoViz — Build Rules

## Product
GeoViz is a service that audits whether businesses are visible and recommended in AI search tools like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews.

Core promise:
“Find out if AI tools recommend your business.”

IMPORTANT:
We are NOT building a full SaaS yet.
We are building a lean MVP that sells paid AI Visibility Reports with manual fulfillment.

## Brand Name
GeoViz

## Positioning (CRITICAL)
Do NOT lead with “GEO.”
Do NOT assume users understand AI search.

Always frame as:
- “AI visibility”
- “Being recommended by ChatGPT”
- “Showing up when customers ask AI who to hire”

Primary headline:
“When customers ask ChatGPT who to hire, does your business show up?”

## Target Customers
Local service businesses:
- roofers
- HVAC companies
- contractors
- lawyers
- dentists
- med spas
- real estate agents

## Core Offer
AI Visibility Audit — $147

User provides:
- website URL
- email
- optional business name
- optional competitor URL

They receive:
- AI Visibility Score (0–100)
- plain-English breakdown
- key visibility issues
- why it matters
- top priority fixes
- professional PDF report

## Upsell
GEO Foundation Fix — starting at $497

Includes:
- schema implementation or repair
- llms.txt creation
- robots.txt optimization for AI crawlers
- homepage clarity improvements
- service page clarity improvements
- FAQ structure for AI readability
- before/after comparison

## MVP Scope (STRICT)
Build ONLY:

- Landing page
- Order form
- Stripe checkout
- Success / cancel pages
- Sample report page
- Simple admin page
- Order database
- Email notification

DO NOT BUILD:
- dashboards
- login systems
- white-label features
- automation pipelines
- subscription billing
- agency portals
- lead scraping systems

Manual fulfillment is allowed and expected.

## Fulfillment Flow
1. User pays
2. Order is saved
3. Admin is notified
4. Admin manually runs GEO audit tool
5. Report is sent to customer

## Tech Stack
- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- Stripe
- Resend
- Vercel deployment

Do not introduce unnecessary libraries.

## Required Pages
- `/` (landing page)
- `/order`
- `/checkout/success`
- `/checkout/cancel`
- `/sample-report`
- `/admin`

## Admin Requirements
Simple password-protected page using `ADMIN_PASSWORD`.

Display:
- website URL
- email
- payment status
- audit status
- created date
- notes (optional)

## Design Direction
- Dark premium UI
- Clean and serious
- No gimmicks
- Accent color: orange or electric blue
- Mobile responsive
- Looks like a real audit/analysis product

## Conversion Rule
Every section must reinforce:

“I might be invisible when customers ask AI who to hire.”

## Engineering Rules
- TypeScript only
- App Router only
- Clean file structure
- Add `.env.example`
- Include README setup steps
- No skipped error handling
- No fake data in final output
- Code must run

## Critical Constraint
Do NOT overbuild.

This MVP exists for one goal:
→ get first 5 paying customers

Everything else is secondary.
