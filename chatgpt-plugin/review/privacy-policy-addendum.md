# DRAFT: privacy-policy section for the GeoViz ChatGPT plugin

> Not published. For operator review before adding to `https://www.geoviz.ai/privacy`.
> Retention periods in brackets need confirming against the actual Vercel log
> retention on the GeoViz plan.

## GeoViz in ChatGPT

When you use GeoViz inside ChatGPT, ChatGPT sends GeoViz only what is needed to run a website AI-readiness check:

- **The website address** you ask about.
- **Optional details** you choose to include: the business name, city, and state.

GeoViz does not receive your ChatGPT conversation, your name, your email address, or your account details. ChatGPT may attach general request metadata (such as locale or an approximate location); GeoViz ignores it and does not log or store it. GeoViz does not require an account and does not create one.

**How we use it.** GeoViz fetches that website's public homepage, `robots.txt`, and `sitemap.xml`, analyzes them, and returns the result to ChatGPT. GeoViz does not ask any AI system about the business.

**What we keep.**
- The check result and the details you entered are **not stored** in the GeoViz database.
- Our hosting provider (Vercel) keeps operational logs: the checked website's domain, whether the check succeeded, how long it took, and a one-way hash of the requesting IP address, used for abuse prevention and rate limiting. Raw IP addresses, page contents, and the business details you entered are not logged.
- These logs are kept for **[N days — confirm]** and then deleted.

**Sharing.** GeoViz doesn't sell this information or share it with advertisers. The website you ask about receives an ordinary request from GeoViz's scanner (`GeoVizSiteScanner/1.0`).

**Your choices.** You can stop using GeoViz in ChatGPT at any time from ChatGPT's settings. Because nothing you enter is stored, there is no plugin data to delete. Questions: support@geoviz.ai.
