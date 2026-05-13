/**
 * V2 Stage 1 — frontend framework detection (skeleton).
 *
 * Heuristic-only. Detects JS framework hints from the audit markdown
 * — Next.js, React, Vue, etc. Confidence-gated; returns null when
 * uncertain. Pure function — no DB, no SDK, no React.
 *
 * NOT used for scoring. The detection is informational; it feeds the
 * V2 benchmark cohort dimension and the future `renderRequired`
 * heuristic.
 */

export type FrameworkConfidence = "high" | "medium" | "low" | "none";

export type FrameworkDetectionResult = {
  detected: string | null;
  confidence: FrameworkConfidence;
  signals: string[];
};

const EMPTY: FrameworkDetectionResult = {
  detected: null,
  confidence: "none",
  signals: [],
};

/**
 * Priority-ordered rule table. More-specific patterns first
 * (Next.js before React, since Next.js sites are also React sites
 * but the more-specific label is more useful).
 */
const RULES: ReadonlyArray<{
  slug: string;
  pattern: RegExp;
  confidence: FrameworkConfidence;
}> = [
  { slug: "nextjs", pattern: /\b(next\.js|nextjs|_next\/static|__next)\b/i, confidence: "high" },
  { slug: "nuxt", pattern: /\b(nuxt\.js|nuxtjs|_nuxt)\b/i, confidence: "high" },
  { slug: "sveltekit", pattern: /\b(sveltekit|svelte-kit)\b/i, confidence: "high" },
  { slug: "remix", pattern: /\b(remix\.run|@remix-run)\b/i, confidence: "high" },
  { slug: "astro", pattern: /\b(astro\.build|astrojs)\b/i, confidence: "high" },
  { slug: "gatsby", pattern: /\b(gatsby|gatsbyjs)\b/i, confidence: "high" },
  { slug: "react", pattern: /\b(react|reactjs|create-react-app)\b/i, confidence: "medium" },
  { slug: "vue", pattern: /\b(vue\.js|vuejs|vite\s+vue)\b/i, confidence: "medium" },
  { slug: "angular", pattern: /\b(angular|angularjs|@angular)\b/i, confidence: "medium" },
  { slug: "svelte", pattern: /\b(svelte)\b/i, confidence: "low" },
  // Heuristic for "non-framework" sites — static or jQuery-era.
  { slug: "vanilla", pattern: /\b(static\s+html|jquery|server[-\s]?rendered\s+html)\b/i, confidence: "low" },
];

export function detectFramework(args: {
  reportMarkdown: string;
  websiteUrl: string;
}): FrameworkDetectionResult {
  const md = args.reportMarkdown ?? "";
  if (md.trim().length === 0) return EMPTY;

  for (const rule of RULES) {
    const match = rule.pattern.exec(md);
    if (match) {
      return {
        detected: rule.slug,
        confidence: rule.confidence,
        signals: [match[0]],
      };
    }
  }
  return EMPTY;
}
