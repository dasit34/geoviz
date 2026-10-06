/**
 * Proof Engine — GeoViz internal test case (shared by the proposal and
 * staging scripts). Data only: no database, no network, no provider calls.
 * The finding below was observed read-only on the live site on 2026-10-06;
 * nothing here changes https://www.geoviz.ai.
 */
import type { QuestionSetContext } from "../src/lib/monitoring/proof/question-set";

export const GEOVIZ_CASE = {
  websiteUrl: "https://www.geoviz.ai",
  context: {
    businessName: "GeoViz",
    businessCategory: "AI visibility audit service",
    categoryPlural: "AI visibility audit services",
    services: ["AI visibility audits", "AI visibility monitoring"],
    isLocal: false, // online software — no city/state, so no local questions
    competitorNames: [], // none supplied yet; never invented
  } satisfies QuestionSetContext,
  baseline: {
    providers: ["openai", "claude", "gemini", "perplexity"],
    samplesPerPrompt: 2,
    note: "Existing monitoring cycle runner (tracking-prompt@2.0.0, pinned validator models, web-grounded where available). ~7 questions × 4 AI systems × 2 samples = 56 provider calls; staging measured ~$0.02 per call → roughly $1.15 per cycle (estimate).",
  },
  finding: {
    id: "schema:website-softwareapplication-missing",
    observedAt: "2026-10-06",
    title: "Homepage has Organization JSON-LD only — no WebSite or SoftwareApplication/Service entity",
    evidence: [
      "https://www.geoviz.ai/ — one application/ld+json block; @type: Organization (read-only fetch, 2026-10-06).",
      "No WebSite, SoftwareApplication or Service JSON-LD on the homepage.",
      "Free check v1.3 (Production, online business type): score 53; Organization/WebSite/product checklist 3 of 6.",
      "llms.txt and sitemap.xml both return 200 (not part of this finding).",
    ],
    whyHighestConfidence:
      "It is deterministic and directly re-checkable by the website scanner (schema types are extracted on every scan), unlike content or citation findings that depend on judgement or third parties.",
  },
  experiment: {
    action: "Add WebSite and SoftwareApplication JSON-LD to the homepage",
    proposedFix:
      "Add a WebSite entity (name, url) and a SoftwareApplication entity (name, applicationCategory BusinessApplication, operatingSystem Web, url, offers only with the published price) alongside the existing Organization block. Use only facts already published on the site.",
    targetUrl: "https://www.geoviz.ai/",
    expectedCategory: "structured_data",
    verification: "Website scanner re-check after implementation: WebSite and SoftwareApplication present in the homepage JSON-LD types (baseline frozen at the last scan before implementation).",
    followUp: "First completed cycle of the same question-set version after the implementation date (monthly cadence → ~30 days).",
    status: "Ready for operator approval — NOT implemented. The GeoViz site was not modified in this task.",
  },
} as const;
