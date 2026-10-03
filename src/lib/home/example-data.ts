/**
 * EXAMPLE DATA for homepage product demonstrations.
 *
 * Every value here is illustrative — a fictional business, not a GeoViz
 * customer or a real audit result. Anything rendered from this module must
 * carry the visible "Example data" badge (ExampleDataBadge). The shapes and
 * rules mirror the real product (six scored categories with the frozen v1
 * weights, score bands, four API-queried AI systems, rates shown with their
 * denominators, the four verification outcomes) so the demonstration is
 * accurate about HOW GeoViz works without claiming any real result.
 */

export const EXAMPLE_BUSINESS = {
  name: "Northside Roofing",
  location: "Columbus, OH",
} as const;

/** Six v1 categories with their frozen maximum points (sum 100). */
export const EXAMPLE_CATEGORIES = [
  { key: "schema", label: "Structured data", points: 12, max: 25 },
  { key: "crawler", label: "AI crawler access", points: 16, max: 20 },
  { key: "trust", label: "Local trust signals", points: 11, max: 20 },
  { key: "content", label: "Content depth & FAQ", points: 9, max: 15 },
  { key: "brand", label: "Brand & entity clarity", points: 6, max: 10 },
  { key: "tech", label: "Technical accessibility", points: 6, max: 10 },
] as const;

export const EXAMPLE_SCORE = EXAMPLE_CATEGORIES.reduce((s, c) => s + c.points, 0); // 60
export const EXAMPLE_BAND = "Needs Work"; // 46–65 band

/** Derived readiness (computed from the scored categories — NOT a model query). */
export const EXAMPLE_AI_OVERVIEWS_READINESS = 54;

export type ExampleModelResult = {
  provider: "claude" | "openai" | "gemini" | "perplexity";
  label: string;
  verdict: "Clear" | "Partial" | "Unclear";
  note: string;
};

/** How each AI system (queried via its API) read the example business. */
export const EXAMPLE_MODEL_RESULTS: ExampleModelResult[] = [
  { provider: "claude", label: "Anthropic Claude", verdict: "Clear", note: "Identifies the business and its roofing services; service area stated." },
  { provider: "openai", label: "OpenAI GPT", verdict: "Partial", note: "Understands the services; can't confirm the service area from the site." },
  { provider: "gemini", label: "Google Gemini", verdict: "Partial", note: "Finds the business; reviews and credentials are hard to verify." },
  { provider: "perplexity", label: "Perplexity", verdict: "Unclear", note: "Cites a directory listing instead of the business's own site." },
];

export type ExampleTrackedQuestion = {
  text: string;
  /** Mentions out of measured samples, per AI system (2 samples each). */
  results: Record<ExampleModelResult["provider"], { mentioned: number; measured: number }>;
};

export const EXAMPLE_TRACKED_QUESTIONS: ExampleTrackedQuestion[] = [
  {
    text: "Who are the best roofers in Columbus, Ohio?",
    results: { claude: { mentioned: 2, measured: 2 }, openai: { mentioned: 1, measured: 2 }, gemini: { mentioned: 1, measured: 2 }, perplexity: { mentioned: 0, measured: 2 } },
  },
  {
    text: "Who can repair storm damage on my roof near Columbus?",
    results: { claude: { mentioned: 1, measured: 2 }, openai: { mentioned: 0, measured: 2 }, gemini: { mentioned: 1, measured: 2 }, perplexity: { mentioned: 0, measured: 2 } },
  },
  {
    text: "Which roofing companies in Columbus do metal roofs?",
    results: { claude: { mentioned: 0, measured: 2 }, openai: { mentioned: 0, measured: 2 }, gemini: { mentioned: 1, measured: 2 }, perplexity: { mentioned: 0, measured: 1 } },
  },
];

/** Score history from REVIEWED audits only (example). */
export const EXAMPLE_SCORE_HISTORY = [
  { label: "Starting audit", score: 52 },
  { label: "Month 1", score: 55 },
  { label: "Month 2", score: 60 },
];

/** Presence in answers to the SAME tracked questions (example). */
export const EXAMPLE_COMPETITOR_PRESENCE = [
  { name: "Northside Roofing (you)", mentioned: 7, measured: 23, isCustomer: true },
  { name: "Competitor A", mentioned: 12, measured: 23, isCustomer: false },
  { name: "Competitor B", mentioned: 5, measured: 23, isCustomer: false },
];

export type ExampleTask = {
  title: string;
  status: "Suggested" | "Approved" | "In progress" | "Implemented" | "Verified";
};

export const EXAMPLE_TASKS: ExampleTask[] = [
  { title: "Add LocalBusiness structured data with your confirmed address and hours", status: "Verified" },
  { title: "State your service area on the homepage", status: "Implemented" },
  { title: "Answer “Do you repair storm damage?” on the services page", status: "In progress" },
];
