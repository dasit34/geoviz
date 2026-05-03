export type RawAuditImage = {
  src?: string;
  alt?: string | null;
};

export type RawAuditLink = {
  href?: string;
  text?: string;
  type?: "internal" | "external";
};

export type RawAuditMeta = {
  description?: string | null;
  robots?: string | null;
  viewport?: string | null;
  [key: string]: string | null | undefined;
};

export type RawSecurityHeaders = {
  "strict-transport-security"?: string | null;
  "content-security-policy"?: string | null;
  "x-frame-options"?: string | null;
  "x-content-type-options"?: string | null;
  "referrer-policy"?: string | null;
  "permissions-policy"?: string | null;
  [key: string]: string | null | undefined;
};

export type RawAuditJson = {
  url?: string;
  businessName?: string;
  title?: string | null;
  meta?: RawAuditMeta;
  h1?: string[];
  h2?: string[];
  h3?: string[];
  word_count?: number;
  links?: RawAuditLink[];
  images?: RawAuditImage[];
  structured_data?: unknown[];
  security_headers?: RawSecurityHeaders;
  text_content?: string;
  has_ssr_content?: boolean;
  errors?: string[];
};

export type ReportStatus =
  | "Elite"
  | "Strong"
  | "Competitive"
  | "At Risk"
  | "Poor";

export type CategoryKey =
  | "clarity"
  | "structure"
  | "content"
  | "local"
  | "media"
  | "trust";

export type CategoryScore = {
  /** Integer score for the category (0..max). */
  score: number;
  /** Maximum possible for the category — sums to 100 across categories. */
  max: number;
  /** Raw 0..1 fraction before being multiplied to score. */
  fraction: number;
};

export type CategoryScores = Record<CategoryKey, CategoryScore>;

export type ScoringDebug = {
  totalImages: number;
  missingAlt: number;
  missingAltPercent: number;
  h1Detected: boolean;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  schemaDetected: boolean;
  schemaTypes: string[];
  faqDetected: boolean;
  wordCount: number;
  internalLinks: number;
  missingSecurityHeaders: string[];
  hasServiceClarity: boolean;
  hasLocationClarity: boolean;
  cityInTitle: boolean;
  cityInH1: boolean;
  isHttps: boolean;
  hasSsrContent: boolean;
  randomBuffer: number;
};

export type SupportingIssue = {
  id: string;
  title: string;
  detail: string;
};

export type CoreProblem = {
  id: string;
  /** Bucket label rendered as a small pill: Identity / Location / Trust / Content. */
  category: "Identity" | "Location" | "Trust" | "Content";
  /** Declarative problem statement. */
  title: string;
  /** Pure-data findings shown under "What we found". */
  supportingIssues: SupportingIssue[];
  /** One-sentence consequence in business terms — lost calls, missed jobs, customers going to competitors. */
  businessImpact: string;
  /** One-sentence concrete first action. Rendered under "What to fix first". */
  fixFirst: string;
};

export type ActionTag = "Quick win" | "Foundation" | "Authority" | "Cleanup";

export type ActionItem = {
  rank: number;
  title: string;
  body: string;
  tag: ActionTag;
};

export type UpsellSection = {
  title: string;
  copy: string;
  offer: string;
  includes: string[];
};

export type ScoreExplanationItem = {
  /** Plain-English summary of what cost or earned points. */
  label: string;
  /** Negative for losses, positive for gains. */
  impact: number;
};

export type ScoreCap = {
  /** Plain-English reason the cap applies (e.g. "your site doesn't show where you operate"). */
  reason: string;
  /** The numerical ceiling that the cap enforces. */
  capValue: number;
  /** How many points the score could rise by removing this cap. Capped at 18. */
  recoveryPotential: number;
  /** Action title from the action plan that would lift the cap. */
  recommendedFix: string;
};

export type TopFixPreview = {
  /** The headline of the top action item. */
  issue: string;
  currentScore: number;
  projectedScore: number;
  /** Estimated point gain (already clamped to ≤ 18). */
  projectedDelta: number;
};

export type ScoringWeight = {
  category: CategoryKey;
  label: string;
  percent: number;
};

export type VisibilityReport = {
  businessName: string;
  websiteUrl: string;
  overallScore: number;
  status: ReportStatus;
  executiveSummary: string;
  coreProblems: CoreProblem[];
  actionPlan: ActionItem[];
  upsellSection: UpsellSection;
  generatedAt: string;
  categoryScores: CategoryScores;
  scoringDebug: ScoringDebug;
  /** Top 3–5 ranked impacts, each with an estimated point delta. */
  scoreExplanation: ScoreExplanationItem[];
  /** One blunt sentence naming the single biggest factor on the score. */
  primaryDriver: string;
  /** Blunt customer-facing line shown only on lower-scoring sites. Null otherwise. */
  realityCheck: string | null;
  /** One-line money/leads consequence shown directly under the reality check. Null on healthy sites. */
  costOfInaction: string | null;
  /** Single line rendered immediately above the done-for-you offer to remove purchase hesitation. */
  preOfferLine: string;
  /** "What this means in real terms" — up to 3 plain-language consequence bullets. */
  realWorldImpact: string[];
  /** Exactly 3 sentence-level reasons the score landed where it did. Pulled from scoring data. */
  top3Reasons: string[];
  /** Set when a hard-penalty cap is currently limiting the score. */
  scoreCap: ScoreCap | null;
  /** What the score would become if the top action item were applied. */
  topFixPreview: TopFixPreview | null;
  /** Static: the weights used to compute the score (for the explainer block). */
  scoringWeights: ScoringWeight[];
};
