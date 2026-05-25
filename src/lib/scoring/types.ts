/**
 * GeoViz deterministic scoring engine — public + internal types.
 *
 * All types live in one file so the boundary between "what evidence
 * comes in" and "what score goes out" is legible at a glance. The
 * scoring module is pure TypeScript — no I/O, no Date.now (except the
 * `computed_at` ISO timestamp at the very end), no Math.random.
 */

/* ─────────────────────────────────────────────────────────────────
 * Inputs — the structured Evidence object
 * ──────────────────────────────────────────────────────────────── */

/**
 * Evidence is the normalized, pure-TypeScript view of every signal
 * collected during the preflight + ingest + render stages. The
 * scoring module reads ONLY from this object — it never reaches back
 * into preflight types or Prisma. Every field is nullable so the
 * scorer can degrade gracefully when an analyzer failed.
 */
export type Evidence = {
  /** URL the audit ran against (after redirect follow). */
  url: string | null;

  /** Whether the homepage HTML fetch succeeded — load-bearing for almost every score. */
  fetch_ok: boolean;

  /** Schema / JSON-LD evidence (from preflight `validateSchema`). */
  schema: {
    raw_jsonld_block_count: number;
    detected_types: string[];
    present_fields: string[];
    missing_fields: string[];
    malformed_fields: string[];
    /** preflight 0..100 score, present when validation ran. */
    analyzer_score: number | null;
  } | null;

  /** Crawlability evidence (from preflight `auditCrawlability`). */
  crawlability: {
    passed_checks: string[];
    failed_checks: string[];
    findings: string[];
    warnings: string[];
    analyzer_score: number | null;
  } | null;

  /** Entity-consistency evidence (from preflight `checkEntityConsistency`). */
  entity: {
    name: { schema: string | null; homepage: string | null; footer: string | null };
    phone: { schema: string | null; homepage: string | null; footer: string | null };
    address: { schema: string | null; homepage: string | null; footer: string | null };
    inconsistencies: string[];
    /** 0..1 — fraction of surfaces agreeing with the schema reference. */
    surface_agreement: number | null;
    analyzer_score: number | null;
  } | null;

  /** Content / readability evidence (preflight readability + ingest). */
  content: {
    word_count: number | null;
    text_length: number | null;
    parsed_by_readability: boolean | null;
    fallback_used: boolean | null;
    has_h1: boolean | null;
    ai_readability_score: number | null;
    content_density: number | null;
    /** True when FAQPage @type was detected in JSON-LD. Drives the FAQ component of Content. */
    has_faq_schema: boolean;
  } | null;

  /** Optional render-probe evidence (Stage 2). */
  render: {
    attempted: boolean | null;
    successful: boolean | null;
    blank_shell_risk: boolean | null;
    hydration_detected: boolean | null;
    client_only_content_detected: boolean | null;
    content_delta_detected: boolean | null;
    rendered_text_length: number | null;
  } | null;

  /**
   * Light meta — which analyzers populated. Used by `computeConfidence`
   * and by the persisted `evidence_summary` audit trail.
   */
  meta: {
    preflight_ok: boolean;
    schema_validated: boolean;
    crawlability_audited: boolean;
    entity_checked: boolean;
    readable_content_extracted: boolean;
    ingest_present: boolean;
    render_attempted: boolean;
  };
};

/* ─────────────────────────────────────────────────────────────────
 * Internal per-category result
 * ──────────────────────────────────────────────────────────────── */

export type CategoryKey =
  | "schema"
  | "crawler"
  | "trust"
  | "content"
  | "brand"
  | "tech";

export const CATEGORY_MAX: Record<CategoryKey, number> = {
  schema: 25,
  crawler: 20,
  trust: 20,
  content: 15,
  brand: 10,
  tech: 10,
};

export type PublicBucketKey =
  | "understanding"
  | "retrieval"
  | "trust"
  | "recommendation";

export type IssueSeverity = "critical" | "warning" | "info";

export type Issue = {
  /** Stable id, e.g. `"schema.no_localbusiness"`. Same evidence ⇒ same id. */
  id: string;
  severity: IssueSeverity;
  category_key: CategoryKey;
  /** Category weight — used by `deriveTopFindings` to rank across categories. */
  weight: number;
  /** Short customer-facing label. */
  message: string;
};

export type CategoryScoreInternal = {
  key: CategoryKey;
  score: number;     // 0..max
  max: number;
  /** Human-readable signals contributing to the score (audit trail). */
  signals: string[];
  /** Issues detected — feed `deriveTopFindings`. */
  issues: Issue[];
  /** One-line summary of why this score (computed from signals). */
  reason: string;
  /** Pointers to which evidence fields were actually consumed. */
  evidence_used: string[];
  /** Per-category certainty 0..1 — how confident we are in this number. */
  category_confidence: number;
};

/* ─────────────────────────────────────────────────────────────────
 * Caps + penalties — declarative system
 * ──────────────────────────────────────────────────────────────── */

export type CapTarget =
  | `category:${CategoryKey}`
  | `bucket:${PublicBucketKey}`
  | "overall";

export type CapRule = {
  id: string;
  target: CapTarget;
  /** Absolute ceiling — score for the target is clamped to this value when the trigger fires. */
  cap_value: number;
  /** Pure trigger — evaluated against gathered evidence + current categories. */
  triggers_on: (
    evidence: Evidence,
    categories: Record<CategoryKey, CategoryScoreInternal>,
  ) => boolean;
  /** Customer-facing reason text, used in the trace. */
  reason: string;
};

export type CapRecord = {
  rule_id: string;
  target: CapTarget;
  /** Score the target had before the cap clamped it. */
  original_value: number;
  /** Score after the cap. Equal to the rule's `cap_value` when the cap was binding. */
  adjusted_value: number;
  reason: string;
};

export type PenaltyTarget = `bucket:${PublicBucketKey}` | "overall";

export type PenaltyRule = {
  id: string;
  target: PenaltyTarget;
  /** Signed integer; subtract magnitude from the target. Stored as negative for clarity. */
  amount: number;
  triggers_on: (evidence: Evidence) => boolean;
  reason: string;
};

export type PenaltyRecord = {
  rule_id: string;
  target: PenaltyTarget;
  amount: number;
  original_value: number;
  adjusted_value: number;
  reason: string;
};

/* ─────────────────────────────────────────────────────────────────
 * Confidence
 * ──────────────────────────────────────────────────────────────── */

export type ConfidenceLevel = "low" | "moderate" | "high";

export type ConfidenceInputs = {
  /** 0..100 — count(analyzers_ok) / 4 × 100 */
  evidence_completeness: number;
  /** 0 or 100 — preflight overall + fetch ok */
  preflight_success: number;
  /** 0..100 — preflight schema analyzer score */
  schema_certainty: number;
  /** 0..100 — entity surface_agreement × 100 */
  entity_certainty: number;
  /** 0..100 — readability extraction quality */
  content_extraction_quality: number;
  /** 0..100 — render attempted+successful coverage (neutral 50 when only attempted, 0 when not eligible) */
  render_coverage: number;
};

export type ConfidenceScore = {
  /** 0..100 — weighted average of inputs. */
  score: number;
  /** Bucket label: high ≥ 85, moderate 65–84, low < 65. */
  level: ConfidenceLevel;
  inputs: ConfidenceInputs;
};

/* ─────────────────────────────────────────────────────────────────
 * Synergy + recommendation lift
 * ──────────────────────────────────────────────────────────────── */

export type SynergyTier = "none" | "partial" | "primary" | "elite";

export type SynergyResult = {
  /** Categories with the bonus already folded into schema.score. */
  categories: Record<CategoryKey, CategoryScoreInternal>;
  /** 0..5 — capped at 5 by `Math.min`. */
  applied: number;
  tier: SynergyTier;
  reason: string | null;
};

export type RecommendationLiftResult = {
  /** 0..2 — small additive uplift to the Recommendation bucket. */
  applied: number;
  reason: string | null;
};

/* ─────────────────────────────────────────────────────────────────
 * History + stability
 * ──────────────────────────────────────────────────────────────── */

export type ScoreHistoryEntry = {
  computed_at: string;
  overall_score: number;
};

export type StabilityResult = {
  /** Standard deviation over the most recent ≤5 scores; null when history < 3. */
  score_stability_index: number | null;
  /** `stable` / `drifting` / `volatile` / `insufficient_history`. */
  score_stability_reason: string;
};

/* ─────────────────────────────────────────────────────────────────
 * Public output
 * ──────────────────────────────────────────────────────────────── */

export type Band =
  | "Invisible"
  | "At Risk"
  | "Needs Work"
  | "Competitive"
  | "AI-Ready";

export type Finding = {
  id: string;
  severity: IssueSeverity;
  category: CategoryKey;
  message: string;
};

export type Fix = {
  id: string;
  for_finding: string;
  action: string;
  impact: "high" | "medium" | "low";
};

export type CategoryPublic = {
  score: number;
  max: number;
  signals: string[];
  issues: Issue[];
  reason: string;
  evidence_used: string[];
  category_confidence: number;
};

export type BucketPublic = {
  score: number;
  max: number;
  percentage: number;
};

export type EvidenceSummary = {
  preflight_ok: boolean;
  schema_validated: boolean;
  crawlability_audited: boolean;
  entity_checked: boolean;
  ingest_present: boolean;
  render_attempted: boolean;
};

/** Per-bucket trace summary used inside `ScoreTrace`. */
export type BucketTraceEntry = {
  key: PublicBucketKey;
  score: number;
  max: number;
  /** Optional bucket-level reason if any cap/penalty modified the raw value. */
  notes: string[];
};

export type CategoryTraceEntry = {
  key: CategoryKey;
  score: number;
  max: number;
  reason: string;
  category_confidence: number;
};

export type ScoreTraceStage =
  | { stage: "evidence"; summary: EvidenceSummary }
  | { stage: "categories"; summary: CategoryTraceEntry[] }
  | { stage: "buckets_raw"; summary: BucketTraceEntry[] }
  | { stage: "caps_applied"; summary: CapRecord[] }
  | { stage: "penalties_applied"; summary: PenaltyRecord[] }
  | { stage: "recommendation_lift"; summary: RecommendationLiftResult }
  | { stage: "synergy_bonus"; summary: { applied: number; tier: SynergyTier; reason: string | null } }
  | { stage: "buckets_final"; summary: BucketTraceEntry[] }
  | { stage: "overall"; summary: { score: number; band: Band } }
  | { stage: "confidence"; summary: ConfidenceScore }
  | { stage: "stability"; summary: StabilityResult };

export type ScoreTrace = {
  stages: ScoreTraceStage[];
};

export type DeterministicScore = {
  scoring_version: string;
  /**
   * Sha-256 (first 16 hex) of the six-category weight dictionary.
   * Stamped on every audit so silent rubric drift is detectable
   * with a single `SELECT DISTINCT` query. See `frozen.ts`.
   */
  weight_hash: string;
  /**
   * Sha-256 (first 16 hex) of the category structure + public
   * bucket mapping. Flips if a category is added/removed/renamed
   * or the bucket-to-category map changes. See `frozen.ts`.
   */
  category_hash: string;
  overall_score: number;
  band: Band;

  category_scores: Record<CategoryKey, CategoryPublic>;

  synergy_bonus_applied: number;
  synergy_bonus_reason: string | null;
  synergy_bonus_tier: SynergyTier;

  public_bucket_scores: Record<PublicBucketKey, BucketPublic>;

  recommendation_lift_applied: number;
  recommendation_lift_reason: string | null;

  applied_caps: CapRecord[];
  applied_penalties: PenaltyRecord[];

  top_3_findings: Finding[];
  top_3_recommended_fixes: Fix[];

  /** Bucket label — high / moderate / low. */
  confidence_level: ConfidenceLevel;
  /** 0..100 numeric confidence. */
  confidence_score: number;
  /** Sub-scores that fed the confidence number. */
  confidence_inputs: ConfidenceInputs;

  /** Stdev across recent history; null when insufficient. */
  score_stability_index: number | null;
  score_stability_reason: string;

  evidence_summary: EvidenceSummary;
  /** End-to-end audit trail of every pipeline stage. */
  trace: ScoreTrace;
  /** ISO timestamp — the ONLY impure field. */
  computed_at: string;
};
