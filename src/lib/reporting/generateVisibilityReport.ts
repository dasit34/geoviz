import type {
  ActionItem,
  ActionTag,
  CategoryKey,
  CategoryScore,
  CategoryScores,
  CoreProblem,
  RawAuditJson,
  ReportStatus,
  ScoreCap,
  ScoreExplanationItem,
  ScoringDebug,
  ScoringWeight,
  SupportingIssue,
  TopFixPreview,
  UpsellSection,
  VisibilityReport,
} from "./types";

/** Maximum point swing we'll attribute to a single fix in the projection. */
const MAX_SINGLE_FIX_IMPACT = 18;

const SCORING_WEIGHTS: ScoringWeight[] = [
  { category: "clarity", label: "Clarity (what you do)", percent: 25 },
  { category: "structure", label: "Structure (schema markup)", percent: 20 },
  { category: "content", label: "Content (H1, headings, copy)", percent: 20 },
  { category: "local", label: "Local relevance (geo signals)", percent: 15 },
  { category: "media", label: "Media (alt text)", percent: 10 },
  { category: "trust", label: "Trust / technical signals", percent: 10 },
];

// ---------- detection vocabularies ----------

const LOCATION_WORDS = [
  "service area",
  "service areas",
  "serving",
  "we serve",
  "based in",
  "located in",
  "located at",
  "address",
  "city",
  "county",
  "neighborhoods",
  "phoenix",
  "tucson",
  "dallas",
  "austin",
  "denver",
];

const SERVICE_HINT_WORDS = [
  "service",
  "services",
  "we offer",
  "we provide",
  "we install",
  "we repair",
  "we replace",
  "specialize",
  "specializing",
  "specialty",
  "our work",
  "roofing",
  "siding",
  "windows",
  "plumbing",
  "hvac",
  "electrical",
  "remodel",
  "remodeling",
  "landscaping",
  "law firm",
  "attorney",
  "dental",
  "dentist",
  "med spa",
];

const FAQ_HINTS = [
  "frequently asked",
  "faq",
  "common questions",
  "questions we get",
  "q:",
  "q&a",
];

const REQUIRED_SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "referrer-policy",
];

const BUSINESS_SCHEMA_TYPES = new Set(
  [
    "localbusiness",
    "organization",
    "professionalservice",
    "homeandconstructionbusiness",
    "roofingcontractor",
    "plumber",
    "electrician",
    "electricalcontractor",
    "hvacbusiness",
    "generalcontractor",
    "houseputter",
    "automotivebusiness",
    "dentist",
    "attorney",
    "legalservice",
    "medicalbusiness",
    "medicalspa",
    "store",
    "restaurant",
  ].map((s) => s.toLowerCase()),
);

// ---------- helpers ----------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function detectsAny(haystack: string, needles: string[]): boolean {
  const lc = haystack.toLowerCase();
  return needles.some((n) => lc.includes(n));
}

function countMatches(haystack: string, needles: string[]): number {
  const lc = haystack.toLowerCase();
  let n = 0;
  for (const needle of needles) {
    if (lc.includes(needle)) n++;
  }
  return n;
}

function statusFromScore(score: number): ReportStatus {
  if (score >= 90) return "Elite";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Competitive";
  if (score >= 40) return "At Risk";
  return "Poor";
}

const CATEGORY_LABELS = {
  clarity: "clarity",
  structure: "schema markup",
  content: "content quality",
  local: "local relevance",
  media: "image alt text",
  trust: "trust signals",
} as const;

function deriveBusinessName(audit: RawAuditJson): string {
  if (audit.businessName && audit.businessName.trim()) {
    return audit.businessName.trim();
  }
  if (audit.title) {
    const cleaned = audit.title.split(/[|\-–·]/)[0]?.trim();
    if (cleaned) return cleaned;
  }
  if (audit.url) {
    try {
      return new URL(audit.url).hostname.replace(/^www\./, "");
    } catch {
      return audit.url;
    }
  }
  return "Your business";
}

function countMissingAlt(images: RawAuditJson["images"]): number {
  if (!images || images.length === 0) return 0;
  return images.filter((img) => !hasText(img.alt)).length;
}

function listMissingSecurityHeaders(
  headers: RawAuditJson["security_headers"],
): string[] {
  return REQUIRED_SECURITY_HEADERS.filter((k) => !hasText(headers?.[k]));
}

function countInternalLinks(audit: RawAuditJson): number {
  if (!audit.links || audit.links.length === 0) return 0;
  let host = "";
  try {
    host = audit.url ? new URL(audit.url).hostname : "";
  } catch {
    host = "";
  }
  return audit.links.filter((link) => {
    if (link.type === "internal") return true;
    if (!link.href) return false;
    if (link.href.startsWith("/") || link.href.startsWith("#")) return true;
    try {
      return host && new URL(link.href).hostname === host;
    } catch {
      return false;
    }
  }).length;
}

function detectServiceClarity(audit: RawAuditJson): boolean {
  const hero = [
    ...(audit.h1 ?? []),
    ...(audit.h2 ?? []).slice(0, 3),
    audit.title ?? "",
    audit.meta?.description ?? "",
  ]
    .filter(hasText)
    .join(" ");
  if (detectsAny(hero, SERVICE_HINT_WORDS)) return true;
  return detectsAny(
    (audit.text_content ?? "").slice(0, 1500),
    SERVICE_HINT_WORDS,
  );
}

function detectLocationClarity(audit: RawAuditJson): boolean {
  const surface = [
    ...(audit.h1 ?? []),
    ...(audit.h2 ?? []),
    audit.title ?? "",
    audit.meta?.description ?? "",
    (audit.text_content ?? "").slice(0, 2000),
  ]
    .filter(hasText)
    .join(" ");
  return detectsAny(surface, LOCATION_WORDS);
}

function detectFaqContent(audit: RawAuditJson): boolean {
  const surface = [
    ...(audit.h2 ?? []),
    ...(audit.h3 ?? []),
    audit.text_content ?? "",
  ]
    .filter(hasText)
    .join(" ");
  return detectsAny(surface, FAQ_HINTS);
}

function extractSchemaTypes(data: unknown[] | undefined): string[] {
  if (!data || data.length === 0) return [];
  const types: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") types.push(t);
    else if (Array.isArray(t)) {
      for (const x of t) if (typeof x === "string") types.push(x);
    }
    const graph = obj["@graph"];
    if (Array.isArray(graph)) for (const g of graph) visit(g);
  };
  for (const node of data) visit(node);
  return types;
}

function makeCategory(fraction: number, max: number): CategoryScore {
  const clamped = clamp(fraction, 0, 1);
  return {
    fraction: Number(clamped.toFixed(3)),
    max,
    score: Math.round(clamped * max),
  };
}

/**
 * Deterministic per-URL offset in [-magnitude, +magnitude]. Same site → same
 * buffer, but two different sites with otherwise-identical signals get
 * different scores so the report doesn't read as a stamped template.
 */
function seededBuffer(seed: string, magnitude = 3): number {
  if (!seed) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  const range = 2 * magnitude + 1;
  return (((h % range) + range) % range) - magnitude;
}

// ---------- main entrypoint ----------

export function generateVisibilityReport(audit: RawAuditJson): VisibilityReport {
  const businessName = deriveBusinessName(audit);
  const websiteUrl = audit.url ?? "";

  // ----- raw signals -----
  const titlePresent = hasText(audit.title);
  const titleSubstantive = titlePresent && (audit.title ?? "").trim().length >= 20;
  const titleHasService =
    titlePresent && detectsAny(audit.title ?? "", SERVICE_HINT_WORDS);
  const cityInTitle =
    titlePresent && detectsAny(audit.title ?? "", LOCATION_WORDS);

  const metaDesc = audit.meta?.description ?? "";
  const metaPresent = hasText(metaDesc);

  const h1Items = (audit.h1 ?? []).filter(hasText);
  const h1Count = h1Items.length;
  const h1Text = h1Items.join(" ");
  const h1Present = h1Count > 0;
  const h1HasService = h1Present && detectsAny(h1Text, SERVICE_HINT_WORDS);
  const cityInH1 = h1Present && detectsAny(h1Text, LOCATION_WORDS);

  const h2Items = (audit.h2 ?? []).filter(hasText);
  const h2Count = h2Items.length;
  const h3Items = (audit.h3 ?? []).filter(hasText);
  const h3Count = h3Items.length;

  const wordCount = audit.word_count ?? 0;
  const lowWordCount = wordCount < 500;

  const totalImages = audit.images?.length ?? 0;
  const missingAlt = countMissingAlt(audit.images);
  const missingAltPercent =
    totalImages === 0 ? 0 : Math.round((missingAlt / totalImages) * 100);
  const altCompletion = totalImages === 0 ? 0.5 : (totalImages - missingAlt) / totalImages;

  const missingSecurityHeaders = listMissingSecurityHeaders(audit.security_headers);
  const internalLinks = countInternalLinks(audit);
  const noInternalLinks = internalLinks === 0;
  const isHttps = websiteUrl.toLowerCase().startsWith("https://");
  const hasSsrContent = Boolean(audit.has_ssr_content);

  const schemaTypes = extractSchemaTypes(audit.structured_data);
  const schemaDetected = schemaTypes.length > 0;
  const schemaLc = schemaTypes.map((s) => s.toLowerCase());
  const hasBusinessSchema = schemaLc.some(
    (t) =>
      BUSINESS_SCHEMA_TYPES.has(t) ||
      /(business|service|contractor)$/i.test(t),
  );
  const hasServiceSchema = schemaLc.includes("service");
  const hasFaqSchema = schemaLc.some((t) => t === "faqpage" || t === "faq");
  const hasWebPageSchema = schemaLc.some(
    (t) => t === "webpage" || t === "website",
  );
  const schemaMissing = !schemaDetected;

  const hasServiceClarity = detectServiceClarity(audit);
  const hasLocationClarity = detectLocationClarity(audit);
  const hasFaq = detectFaqContent(audit);

  // count distinct location words on the page — used for local-relevance depth
  const surfaceText = [
    audit.title ?? "",
    h1Items.join(" "),
    h2Items.join(" "),
    metaDesc,
    (audit.text_content ?? "").slice(0, 2000),
  ].join(" ");
  const geoTermHits = countMatches(surfaceText, LOCATION_WORDS);

  // ----- category scoring (weighted, fraction × max) -----

  // Clarity (25%) — what you do, communicated through text + headings + meta.
  // Tuned so that a single explicit service-naming H1 is the gold-standard
  // signal and weighted accordingly.
  const clarityFraction =
    0.18 * Number(titleSubstantive) +
    0.15 * Number(titleHasService) +
    0.13 * Number(h1Present) +
    0.20 * Number(h1HasService) +
    0.09 * Number(metaPresent) +
    0.15 * Number(hasServiceClarity) +
    0.10 *
      (detectsAny((audit.text_content ?? "").slice(0, 1500), SERVICE_HINT_WORDS)
        ? 1
        : 0);
  const clarity = makeCategory(clarityFraction, 25);

  // Structure (20%) — schema markup
  let structureFraction = 0;
  if (hasBusinessSchema) structureFraction += 0.45;
  if (hasServiceSchema) structureFraction += 0.25;
  if (hasFaqSchema) structureFraction += 0.20;
  if (hasWebPageSchema) structureFraction += 0.05;
  if (schemaDetected && structureFraction === 0) {
    // some schema present but none of the recognised business types — partial credit
    structureFraction = 0.15;
  }
  const structure = makeCategory(structureFraction, 20);

  // Content (20%) — H1, headings, copy depth, citable Q&A
  const h1Score = h1Count === 0 ? 0 : h1Count === 1 ? 1 : 0.5;
  const h2Score =
    h2Count === 0 ? 0 : h2Count <= 1 ? 0.4 : h2Count <= 6 ? 1 : 0.7;
  const wordScore =
    wordCount < 200
      ? 0
      : wordCount < 500
        ? 0.4
        : wordCount < 800
          ? 0.8
          : 1;
  const faqBonus = hasFaq ? 1 : 0;
  const contentFraction =
    0.25 * h1Score +
    0.20 * h2Score +
    0.35 * wordScore +
    0.20 * faqBonus;
  const content = makeCategory(contentFraction, 20);

  // Local (15%) — geographic relevance. Gold-standard is city in BOTH the
  // title and the H1; broad mentions are credited but rewarded less.
  const localFraction =
    0.40 * Number(cityInTitle) +
    0.30 * Number(cityInH1) +
    0.20 * Number(hasLocationClarity) +
    0.10 * clamp(geoTermHits / 3, 0, 1);
  const local = makeCategory(localFraction, 15);

  // Media (10%) — proportional alt-text completion, normalized by total images
  const media = makeCategory(altCompletion, 10);

  // Trust (10%) — security headers, internal linking, https, ssr
  const securityFraction =
    (REQUIRED_SECURITY_HEADERS.length - missingSecurityHeaders.length) /
    REQUIRED_SECURITY_HEADERS.length;
  const internalLinksFraction = clamp(internalLinks / 5, 0, 1);
  const trustFraction =
    0.40 * securityFraction +
    0.30 * internalLinksFraction +
    0.15 * Number(hasSsrContent) +
    0.15 * Number(isHttps);
  const trust = makeCategory(trustFraction, 10);

  const categoryScores: CategoryScores = {
    clarity,
    structure,
    content,
    local,
    media,
    trust,
  };

  // ----- final score: deterministic pipeline (no random buffer) -----
  // Step 1: sum of category scores.
  const baseScore =
    clarity.score +
    structure.score +
    content.score +
    local.score +
    media.score +
    trust.score;

  // Step 2: contribution rule — at least 4 categories must score ≥ 50%.
  const categoryFractions = [
    clarity.fraction,
    structure.fraction,
    content.fraction,
    local.fraction,
    media.fraction,
    trust.fraction,
  ];
  const strongCategoryCount = categoryFractions.filter((f) => f >= 0.5).length;
  const contributionPenalty = strongCategoryCount < 4 ? 5 : 0;

  // Step 3: soft cap — any category below 50% caps the ceiling at 85.
  const softCapApplied = categoryFractions.some((f) => f < 0.5);
  const softCap = softCapApplied ? 85 : 100;

  // Step 4: hard penalty — missing dealbreakers (no H1 / no service clarity /
  // no location) drop the cap further. 1 missing → 70, 2 → 55, 3 → 45.
  const dealbreakers = [
    { id: "noH1", missing: !h1Present, label: "no H1" },
    {
      id: "noService",
      missing: !hasServiceClarity,
      label: "no clear service language",
    },
    {
      id: "noLocation",
      missing: !hasLocationClarity,
      label: "no location signal",
    },
  ];
  const missingDealbreakerCount = dealbreakers.filter((d) => d.missing).length;
  // Smoothed caps so a single dealbreaker fix can't swing the score more than
  // ~17 points (deltas: 100→82=18, 82→65=17, 65→50=15).
  const hardCap =
    missingDealbreakerCount === 0
      ? 100
      : missingDealbreakerCount === 1
        ? 82
        : missingDealbreakerCount === 2
          ? 65
          : 50;

  // Buffer kept in scoringDebug for legacy/observability — NOT applied.
  const randomBuffer = seededBuffer(websiteUrl || businessName, 3);

  const overallScore = clamp(
    Math.min(baseScore - contributionPenalty, softCap, hardCap),
    0,
    100,
  );
  const status = statusFromScore(overallScore);

  // ----- core problems (max 4) — drive off detection booleans (not scoring) -----
  const coreProblemsRaw = buildCoreProblems({
    schemaMissing,
    hasServiceClarity,
    titleMissing: !titlePresent,
    noH1: !h1Present,
    metaMissing: !metaPresent,
    hasLocationClarity,
    hasFaq,
    missingAlt,
    totalImages,
    lowWordCount,
    wordCount,
    missingSecurityHeaders,
    noInternalLinks,
  });

  // Force one dominant problem: surface the dealbreaker-matched problem first
  // so the "main reason" callout in the UI lands on the issue actually
  // capping the score.
  const coreProblems = reorderForDealbreaker({
    problems: coreProblemsRaw,
    noLocation: !hasLocationClarity,
    noService: !hasServiceClarity,
    noH1Flag: !h1Present,
  });

  const actionPlan = buildActionPlan({
    schemaMissing,
    hasServiceClarity,
    hasLocationClarity,
    hasFaq,
    titleMissing: !titlePresent,
    metaMissing: !metaPresent,
    missingAlt,
    lowWordCount,
    missingSecurityHeaders,
  });

  const executiveSummary = buildExecutiveSummary({
    businessName,
    score: overallScore,
    status,
    coreProblemCount: coreProblems.length,
  });

  const scoreExplanation = buildScoreExplanation({
    categoryScores,
    schemaMissing,
    hasServiceClarity,
    hasLocationClarity,
    hasFaq,
    titleMissing: !titlePresent,
    metaMissing: !metaPresent,
    noH1: !h1Present,
    missingAlt,
    totalImages,
    lowWordCount,
    wordCount,
    missingSecurityHeaders,
    noInternalLinks,
  });

  const realityCheck = buildRealityCheck({
    audit,
    status,
  });

  const realWorldImpact = buildRealWorldImpact({ status });

  const top3Reasons = buildTop3Reasons(scoreExplanation);

  const costOfInaction =
    status === "Poor" || status === "At Risk" || status === "Competitive"
      ? "Those jobs are going to competitors."
      : null;

  const preOfferLine =
    "This is fixable quickly — but only if these issues are addressed correctly.";

  // Defensive normalization: strip leading/trailing whitespace and any
  // trailing comma(s). Guards against drift where a label or appended
  // suffix accidentally introduces a stray trailing comma.
  const primaryDriver = pickPrimaryDriver({
    dealbreakers,
    missingDealbreakerCount,
    categoryScores,
  })
    .trim()
    .replace(/,+$/, "");

  const scoreCap = buildScoreCap({
    missingDealbreakerCount,
    dealbreakers,
    hardCap,
    actionPlan,
  });

  const topFixPreview = buildTopFixPreview({
    actionPlan,
    overallScore,
    categoryScores,
    missingDealbreakerCount,
  });

  const upsellSection: UpsellSection = {
    title: "Want us to handle this for you?",
    copy: "You don’t need to figure this out — we fix it for you. More complex cases are quoted upfront.",
    offer: "GEO Foundation Fix — $497",
    includes: [
      "Fix the issues found in your audit",
      "Improve AI visibility across ChatGPT and other platforms",
      "Optimize structured data and business signals",
      "Re-check your visibility after fixes",
    ],
  };

  const scoringDebug: ScoringDebug = {
    totalImages,
    missingAlt,
    missingAltPercent,
    h1Detected: h1Present,
    h1Count,
    h2Count,
    h3Count,
    schemaDetected,
    schemaTypes,
    faqDetected: hasFaq,
    wordCount,
    internalLinks,
    missingSecurityHeaders,
    hasServiceClarity,
    hasLocationClarity,
    cityInTitle,
    cityInH1,
    isHttps,
    hasSsrContent,
    randomBuffer,
  };

  // ---- safeguard: lock primaryDriver and costOfInaction shapes ----
  // Prevents future drift back into multi-clause / appended sentences.
  if (primaryDriver.includes(",") || primaryDriver.includes(" and ")) {
    throw new Error(
      `primaryDriver must be a single, clean sentence (got: "${primaryDriver}")`,
    );
  }
  if (costOfInaction !== null) {
    if (costOfInaction.includes(",") || costOfInaction.length > 60) {
      throw new Error(
        `costOfInaction must be short and direct (got: "${costOfInaction}")`,
      );
    }
  }

  return {
    businessName,
    websiteUrl,
    overallScore,
    status,
    executiveSummary,
    coreProblems,
    actionPlan,
    upsellSection,
    generatedAt: new Date().toISOString(),
    categoryScores,
    scoringDebug,
    scoreExplanation,
    primaryDriver,
    realityCheck,
    costOfInaction,
    preOfferLine,
    realWorldImpact,
    top3Reasons,
    scoreCap,
    topFixPreview,
    scoringWeights: SCORING_WEIGHTS,
  };
}

// ---------- "What this means in real terms" ----------

function buildRealWorldImpact(args: { status: ReportStatus }): string[] {
  switch (args.status) {
    case "Poor":
    case "At Risk":
      return [
        "You’re not showing up when customers ask AI who to hire.",
        "Competitors with cleaner pages are being recommended in your place.",
        "High-intent leads are going to other businesses without you knowing.",
      ];
    case "Competitive":
      return [
        "You show up in some AI answers — not the ones with the highest buying intent.",
        "When customers compare you against competitors, AI doesn’t have enough to pick you.",
        "You’re leaving leads on the table that a few targeted fixes would unlock.",
      ];
    case "Strong":
      return [
        "AI is recommending you for many of the right local searches.",
        "The remaining gaps are what separate you from competitors who are catching up.",
        "Closing them widens your lead and reduces the chance of being overtaken.",
      ];
    case "Elite":
      return [
        "AI consistently recommends you for relevant local searches.",
        "You’ve solved the problems most local businesses haven’t.",
        "From here it’s about staying ahead, not catching up.",
      ];
  }
}

// ---------- Top 3 reasons (under the score) ----------

function buildTop3Reasons(scoreExplanation: ScoreExplanationItem[]): string[] {
  // Use the same ranked insights, take the negative ones first, fall back to
  // positives only if we don't have 3 negatives. Strip the impact numbers —
  // this list is prose-only, placed directly under the score.
  const negatives = scoreExplanation
    .filter((i) => i.impact < 0)
    .slice(0, 3)
    .map((i) => i.label);
  if (negatives.length === 3) return negatives;

  const positives = scoreExplanation
    .filter((i) => i.impact >= 0)
    .map((i) => i.label);

  // Pad with neutral defaults if everything is fine.
  const defaults = [
    "Your major signals are healthy.",
    "Competitors aren’t finding obvious openings.",
    "Maintenance from here is about staying ahead.",
  ];
  return [...negatives, ...positives, ...defaults].slice(0, 3);
}

// ---------- score explanation ----------

const NEGATIVE_DRIVER_LABEL: Record<CategoryKey, string> = {
  clarity: "Your homepage doesn’t make it obvious what you sell.",
  structure:
    "Key signals confirming you’re a real local business are missing.",
  content: "Your homepage doesn’t have the depth required.",
  local: "Your service area isn’t clearly stated.",
  media: "Your project photos have no descriptions.",
  trust:
    "Standard signals that mark a site as well-maintained are missing.",
};

const POSITIVE_DRIVER_LABEL: Record<CategoryKey, string> = {
  clarity: "Your homepage clearly states what you sell",
  structure: "Your schema markup confirms exactly who you are",
  content: "Your content has the depth needed to be cited",
  local: "Your service area is clearly stated",
  media: "Your photos are properly described",
  trust: "Your site’s credibility signals are in good shape",
};

/**
 * Customer-facing explanation. Each line reads as a one-sentence consultant
 * insight, not a category-level label. Ranked by absolute impact, capped at 5.
 */
function buildScoreExplanation(args: {
  categoryScores: CategoryScores;
  schemaMissing: boolean;
  hasServiceClarity: boolean;
  hasLocationClarity: boolean;
  hasFaq: boolean;
  titleMissing: boolean;
  metaMissing: boolean;
  noH1: boolean;
  missingAlt: number;
  totalImages: number;
  lowWordCount: boolean;
  wordCount: number;
  missingSecurityHeaders: string[];
  noInternalLinks: boolean;
}): ScoreExplanationItem[] {
  const items: ScoreExplanationItem[] = [];

  if (args.schemaMissing) {
    items.push({
      label:
        "Search engines and AI have no structured data identifying your business, services, or service area.",
      impact: -args.categoryScores.structure.max,
    });
  }
  if (!args.hasLocationClarity) {
    items.push({
      label:
        "Your site never clearly names the cities you serve, so AI filters you out of local searches.",
      impact: -15,
    });
  }
  if (!args.hasServiceClarity) {
    items.push({
      label:
        "Your homepage never names your core services in plain language.",
      impact: -10,
    });
  }
  if (!args.hasFaq) {
    items.push({
      label:
        "There’s no FAQ content for AI to quote when customers ask common questions.",
      impact: -5,
    });
  }
  if (args.missingAlt > 0 && args.totalImages > 0) {
    const lostFromMedia = Math.max(
      3,
      Math.round((args.missingAlt / args.totalImages) * 10),
    );
    items.push({
      label: `${args.missingAlt} of your ${args.totalImages} photos have no descriptions, so AI can’t see your portfolio of finished work.`,
      impact: -lostFromMedia,
    });
  }
  if (args.lowWordCount && args.wordCount > 0) {
    items.push({
      label: `Your homepage is too thin (${args.wordCount} words) for AI to weigh you as authoritative.`,
      impact: -5,
    });
  }
  if (args.noH1) {
    items.push({
      label:
        "Your homepage has no main headline, so AI can’t confirm what the page is about.",
      impact: -5,
    });
  }
  if (args.titleMissing) {
    items.push({
      label:
        "Your page has no title, so AI has nothing to anchor a summary on.",
      impact: -5,
    });
  } else if (args.metaMissing) {
    items.push({
      label:
        "There’s no meta description telling AI how to introduce you in one line.",
      impact: -3,
    });
  }
  if (args.noInternalLinks) {
    items.push({
      label:
        "The homepage doesn’t link to your service or service-area pages, so AI can’t discover them.",
      impact: -3,
    });
  }
  if (args.missingSecurityHeaders.length > 0) {
    items.push({
      label:
        "Standard site-trust signals aren’t set, which compounds with the other gaps.",
      impact: -3,
    });
  }

  // If we have fewer than 3 negatives, surface a positive contributor so the
  // explanation never reads as if everything is broken.
  if (items.length < 3) {
    const strongest = (Object.keys(args.categoryScores) as CategoryKey[])
      .map((key) => ({ key, c: args.categoryScores[key] }))
      .sort((a, b) => b.c.score - a.c.score)[0];
    if (strongest && strongest.c.score >= 8) {
      items.push({
        label: POSITIVE_DRIVER_LABEL[strongest.key],
        impact: strongest.c.score,
      });
    }
  }

  // Rank by absolute impact, take top 5.
  return items
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 5);
}

// ---------- primary driver ----------

const DEALBREAKER_DRIVER_LABEL: Record<string, string> = {
  noLocation: "Your website doesn’t clearly state where you operate.",
  noService: "Your homepage never says what you actually sell.",
  noH1: "Your homepage has no clear main headline.",
};

function pickPrimaryDriver(args: {
  dealbreakers: Array<{ id: string; missing: boolean; label: string }>;
  missingDealbreakerCount: number;
  categoryScores: CategoryScores;
}): string {
  const { dealbreakers, missingDealbreakerCount, categoryScores } = args;

  // Dealbreakers always lead.
  if (missingDealbreakerCount > 0) {
    const missing = dealbreakers.find((d) => d.missing)!;
    return DEALBREAKER_DRIVER_LABEL[missing.id] ?? missing.label;
  }

  // Otherwise, the category that lost the most points.
  let worstKey: CategoryKey | null = null;
  let worstLoss = 0;
  for (const key of Object.keys(categoryScores) as CategoryKey[]) {
    const c = categoryScores[key];
    const lost = c.max - c.score;
    if (lost > worstLoss) {
      worstLoss = lost;
      worstKey = key;
    }
  }

  if (worstKey === null || worstLoss < 3) {
    return "Every major signal is in good shape";
  }
  return NEGATIVE_DRIVER_LABEL[worstKey];
}

// ---------- reality check (low-score sites only) ----------

const PRIMARY_SERVICE_NAMES = [
  "roofing",
  "siding",
  "windows",
  "plumbing",
  "hvac",
  "electrical work",
  "remodeling",
  "landscaping",
  "dental care",
  "med spa treatments",
  "legal services",
  "real estate",
];

function detectPrimaryService(audit: RawAuditJson): string {
  const surface = [
    audit.title ?? "",
    ...(audit.h1 ?? []),
    ...(audit.h2 ?? []).slice(0, 4),
    audit.meta?.description ?? "",
  ]
    .filter(hasText)
    .join(" ")
    .toLowerCase();
  for (const name of PRIMARY_SERVICE_NAMES) {
    if (surface.includes(name)) return name;
  }
  return "what you do";
}

function buildRealityCheck(args: {
  audit: RawAuditJson;
  status: ReportStatus;
}): string | null {
  const { audit, status } = args;
  const service = detectPrimaryService(audit);

  if (status === "Poor" || status === "At Risk") {
    return `When someone asks AI who to hire for ${service} in your area today, your business won’t be recommended.`;
  }
  if (status === "Competitive") {
    return `When someone asks AI who to hire for ${service} in your area today, your business won’t be the first one named.`;
  }
  return null;
}

// ---------- score cap (the visible callout) ----------

const DEALBREAKER_CAP_REASON: Record<string, string> = {
  noLocation: "your site doesn’t clearly show where you operate",
  noService: "your homepage never says, in plain words, what you actually sell",
  noH1: "your homepage has no main headline for AI to anchor on",
};

const DEALBREAKER_CAP_FIX: Record<string, string> = {
  noLocation:
    "Add a Service Areas section listing every city you cover, and put your primary city in the title and H1.",
  noService:
    "Rewrite the hero so your top services are named in plain language — in the H1 and the title.",
  noH1: "Add a single H1 naming your service and your primary city.",
};

function buildScoreCap(args: {
  missingDealbreakerCount: number;
  dealbreakers: Array<{ id: string; missing: boolean; label: string }>;
  hardCap: number;
  actionPlan: ActionItem[];
}): ScoreCap | null {
  const { missingDealbreakerCount, dealbreakers, hardCap } = args;
  if (missingDealbreakerCount === 0) return null;

  // Use the first missing dealbreaker as the "headline" for the cap callout.
  const lead = dealbreakers.find((d) => d.missing)!;
  const reason = DEALBREAKER_CAP_REASON[lead.id] ?? lead.label;
  const recommendedFix = DEALBREAKER_CAP_FIX[lead.id] ?? "See action plan.";

  // Recovery potential = how much the cap rises when one dealbreaker is fixed.
  // Walk one step up the cap ladder.
  const nextHardCap =
    missingDealbreakerCount === 1
      ? 100
      : missingDealbreakerCount === 2
        ? 82
        : 65;
  const recoveryPotential = Math.min(
    MAX_SINGLE_FIX_IMPACT,
    Math.max(0, nextHardCap - hardCap),
  );

  return {
    reason,
    capValue: hardCap,
    recoveryPotential,
    recommendedFix,
  };
}

// ---------- top fix preview ----------

function buildTopFixPreview(args: {
  actionPlan: ActionItem[];
  overallScore: number;
  categoryScores: CategoryScores;
  missingDealbreakerCount: number;
}): TopFixPreview | null {
  const { actionPlan, overallScore, categoryScores, missingDealbreakerCount } =
    args;
  if (actionPlan.length === 0) return null;

  const top = actionPlan[0]!;
  const t = top.title.toLowerCase();

  let estimated = 0;
  if (t.includes("schema")) {
    // Adding LocalBusiness/Service/FAQPage schema brings structure to ~18.
    estimated = Math.max(0, 18 - categoryScores.structure.score);
  } else if (t.includes("hero")) {
    // Rewriting hero hits clarity + can lift dealbreakers.
    estimated =
      Math.max(0, 25 - categoryScores.clarity.score) +
      (missingDealbreakerCount > 0 ? 6 : 0);
  } else if (t.includes("faq")) {
    estimated = 8;
  } else if (t.includes("title") || t.includes("description")) {
    estimated = Math.max(0, 5);
  } else if (t.includes("photos") || t.includes("alt")) {
    estimated = Math.max(0, 10 - categoryScores.media.score);
  } else if (t.includes("expand") || t.includes("homepage")) {
    estimated = 6;
  } else if (t.includes("security")) {
    estimated = 4;
  } else {
    estimated = 5;
  }

  // Single-fix cap so we never claim more than ~18 from one action.
  const projectedDelta = Math.max(0, Math.min(MAX_SINGLE_FIX_IMPACT, estimated));
  if (projectedDelta === 0) return null;

  const projectedScore = Math.min(100, overallScore + projectedDelta);

  return {
    issue: top.title,
    currentScore: overallScore,
    projectedScore,
    projectedDelta,
  };
}

// ---------- problem reordering (force one dominant problem) ----------

function reorderForDealbreaker(args: {
  problems: CoreProblem[];
  noLocation: boolean;
  noService: boolean;
  noH1Flag: boolean;
}): CoreProblem[] {
  const { problems, noLocation, noService, noH1Flag } = args;
  if (problems.length <= 1) return problems;

  // Priority of dealbreakers (matches the cap ladder severity).
  let targetId: "location" | "identity" | null = null;
  if (noLocation) targetId = "location";
  else if (noService || noH1Flag) targetId = "identity";

  if (!targetId) return problems;
  const idx = problems.findIndex((p) => p.id === targetId);
  if (idx <= 0) return problems;

  const reordered = [...problems];
  const [primary] = reordered.splice(idx, 1);
  if (!primary) return problems;
  return [primary, ...reordered];
}

// ---------- problem grouping ----------

function buildCoreProblems(args: {
  schemaMissing: boolean;
  hasServiceClarity: boolean;
  titleMissing: boolean;
  noH1: boolean;
  metaMissing: boolean;
  hasLocationClarity: boolean;
  hasFaq: boolean;
  missingAlt: number;
  totalImages: number;
  lowWordCount: boolean;
  wordCount: number;
  missingSecurityHeaders: string[];
  noInternalLinks: boolean;
}): CoreProblem[] {
  const {
    schemaMissing,
    hasServiceClarity,
    titleMissing,
    noH1,
    metaMissing,
    hasLocationClarity,
    hasFaq,
    missingAlt,
    totalImages,
    lowWordCount,
    wordCount,
    missingSecurityHeaders,
    noInternalLinks,
  } = args;

  const coreProblems: CoreProblem[] = [];

  // ----- Identity (what you do) -----
  const identityIssues: SupportingIssue[] = [];
  if (schemaMissing) {
    identityIssues.push({
      id: "schema",
      title: "No schema markup",
      detail: "0 structured-data blocks detected.",
    });
  }
  if (!hasServiceClarity) {
    identityIssues.push({
      id: "service-language",
      title: "Hero doesn’t name a service",
      detail: "No service term found in the title, H1, or top headings.",
    });
  }
  if (titleMissing) {
    identityIssues.push({
      id: "title",
      title: "Page title is empty",
      detail: "No <title> tag content.",
    });
  }
  if (noH1) {
    identityIssues.push({
      id: "h1",
      title: "No main headline",
      detail: "No H1 element on the page.",
    });
  }
  if (metaMissing) {
    identityIssues.push({
      id: "meta",
      title: "No meta description",
      detail: "Description tag is empty.",
    });
  }
  if (identityIssues.length > 0) {
    coreProblems.push({
      id: "identity",
      category: "Identity",
      title: "AI can’t tell what you actually do",
      supportingIssues: identityIssues.slice(0, 3),
      businessImpact:
        "Customers asking for your services are being pointed to competitors with clearer messaging.",
      fixFirst:
        "Add LocalBusiness schema and rewrite the hero so your top services appear in the H1 and the title.",
    });
  }

  // ----- Location (where you operate) -----
  if (!hasLocationClarity) {
    coreProblems.push({
      id: "location",
      category: "Location",
      title: "AI doesn’t know where you operate",
      supportingIssues: [
        {
          id: "no-areas",
          title: "No service area listed",
          detail: "0 cities, suburbs, or zips found on the homepage.",
        },
        {
          id: "no-city-in-headers",
          title: "No city in title or H1",
          detail: "Geo terms not detected in your most prominent text.",
        },
      ],
      businessImpact:
        "When customers search locally, you’re not even being considered — those jobs go to whoever names a city on their site.",
      fixFirst:
        "Add a Service Areas section listing every city you cover, and put your primary city in the title and H1.",
    });
  }

  // ----- Trust (credibility signals) -----
  const trustIssues: SupportingIssue[] = [];
  if (missingAlt > 0) {
    const pct = Math.round((missingAlt / totalImages) * 100);
    trustIssues.push({
      id: "alt-missing",
      title: `${missingAlt} of ${totalImages} photos missing descriptions`,
      detail: `${pct}% of images have no alt text.`,
    });
  }
  if (missingSecurityHeaders.length > 0) {
    trustIssues.push({
      id: "security-headers",
      title: "Missing standard security headers",
      detail: `Not set: ${missingSecurityHeaders.join(", ")}.`,
    });
  }
  if (noInternalLinks) {
    trustIssues.push({
      id: "no-internal-links",
      title: "Homepage doesn’t link to the rest of the site",
      detail: "0 internal links found.",
    });
  }
  if (trustIssues.length > 0) {
    coreProblems.push({
      id: "trust",
      category: "Trust",
      title: "Your site reads as unmaintained",
      supportingIssues: trustIssues.slice(0, 3),
      businessImpact:
        "In close calls between you and a competitor, yours loses — and the job goes to them.",
      fixFirst:
        "Write alt text for every project photo and have your developer enable the missing security headers.",
    });
  }

  // ----- Content (depth and clarity) -----
  const contentIssues: SupportingIssue[] = [];
  if (!hasFaq) {
    contentIssues.push({
      id: "no-faq",
      title: "No FAQ content",
      detail: "No question-and-answer patterns matched.",
    });
  }
  if (lowWordCount) {
    contentIssues.push({
      id: "thin",
      title: `Thin homepage (${wordCount} words)`,
      detail: "Target range: 600–900 words.",
    });
  }
  if (contentIssues.length > 0) {
    coreProblems.push({
      id: "content",
      category: "Content",
      title: "There’s nothing on the page worth quoting",
      supportingIssues: contentIssues.slice(0, 3),
      businessImpact:
        "When AI answers customer questions in your space, your competitors get cited by name and you don’t come up at all.",
      fixFirst:
        "Add an FAQ section with 6–10 real customer questions, and expand the homepage to 600–900 words.",
    });
  }

  return coreProblems;
}

// ---------- action plan ----------

function buildActionPlan(args: {
  schemaMissing: boolean;
  hasServiceClarity: boolean;
  hasLocationClarity: boolean;
  hasFaq: boolean;
  titleMissing: boolean;
  metaMissing: boolean;
  missingAlt: number;
  lowWordCount: boolean;
  missingSecurityHeaders: string[];
}): ActionItem[] {
  const {
    schemaMissing,
    hasServiceClarity,
    hasLocationClarity,
    hasFaq,
    titleMissing,
    metaMissing,
    missingAlt,
    lowWordCount,
    missingSecurityHeaders,
  } = args;

  const items: ActionItem[] = [];
  let rank = 1;
  const push = (tag: ActionTag, title: string, body: string) => {
    if (items.length >= 6) return;
    items.push({ rank: rank++, tag, title, body });
  };

  if (schemaMissing) {
    push(
      "Foundation",
      "Add LocalBusiness, Service, and FAQPage schema",
      "This is what makes you legible to AI as a real local business with real services in a real area. Nothing else moves the needle as much.",
    );
  }
  if (!hasServiceClarity || !hasLocationClarity) {
    push(
      "Foundation",
      "Rewrite the homepage hero",
      "Above the fold, name your top three services and the cities you cover. Plain language, in the words customers use.",
    );
  }
  if (!hasFaq) {
    push(
      "Authority",
      "Build a real FAQ",
      "Six to ten questions you actually get on intake calls, with two- or three-sentence answers. AI cites this format almost word-for-word.",
    );
  }
  if (titleMissing || metaMissing) {
    push(
      "Quick win",
      "Set the page title and description",
      "Title format: ‘[Service] in [City] | [Business]’. Description: 140–160 characters, naming service + city + one differentiator. Ten minutes of work.",
    );
  }
  if (missingAlt > 0) {
    push(
      "Quick win",
      "Describe your top photos",
      "One sentence each for the hero image, top three project photos, and before/afters. Specific to the actual work shown.",
    );
  }
  if (lowWordCount) {
    push(
      "Authority",
      "Expand the homepage to 600–900 words",
      "Cover services, areas, differentiators, and what to expect when a customer calls.",
    );
  }
  if (missingSecurityHeaders.length > 0) {
    push(
      "Cleanup",
      "Enable the missing security headers",
      "HSTS, X-Content-Type-Options, Referrer-Policy, and a basic CSP. A 30-minute job for any web developer.",
    );
  }

  return items;
}

// ---------- executive summary ----------

function buildExecutiveSummary(args: {
  businessName: string;
  score: number;
  status: ReportStatus;
  coreProblemCount: number;
}): string {
  const { businessName, score, status, coreProblemCount } = args;
  const head = `Score: ${score}/100 — ${status}.`;

  if (status === "Elite") {
    return `${head} ${businessName} is operating at the top of what local AI visibility allows. The items below are refinements — your job now is staying ahead, not catching up.`;
  }
  if (status === "Strong") {
    return `${head} ${businessName} is already in the conversation. The items below widen the gap on competitors who are catching up.`;
  }
  if (status === "Competitive") {
    return `${head} ${businessName} shows up reliably for some queries — the gaps below are what stops AI from citing you for the higher-intent ones.`;
  }
  if (status === "At Risk") {
    return `${head} ${businessName} appears in some AI answers, not consistently. The pattern below is what separates a business AI cites by name from one it summarizes generically. Start at the top of the action plan.`;
  }
  // Poor
  return `${head} ${businessName} is reachable, but AI can’t confidently tell what you do, where you serve, or why a customer should pick you. Most of the ${coreProblemCount} problems below are content gaps, not technical bugs — fixable in days, not months. Closing the first two action items typically lifts the score by 25–35 points.`;
}
