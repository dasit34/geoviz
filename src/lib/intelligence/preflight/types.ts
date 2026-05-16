// V2 preflight intelligence types.
//
// "Preflight" = the Node-side analysis stage that runs once per audit,
// fetching the homepage HTML and dispatching to four independent
// analyzers (readability, schema validation, crawlability, entity
// consistency). The consolidated result is persisted to
// `AuditIntelligence.preflightSignals` for V2 monitoring/benchmarking.
//
// Each analyzer's result is nullable so that a partial preflight (one
// module failed, others succeeded) still persists meaningful data.

export type ReadableContentResult = {
  /** Bytes of cleaned readable text after JSDOM + Mozilla Readability. */
  textLength: number;
  /** True when Readability returned a parseable article. */
  parsedByReadability: boolean;
  /** True when we fell back to bare <body> extraction. */
  fallbackUsed: boolean;
  /** Readability's article title, if available. */
  articleTitle: string | null;
  /** Word count of the extracted text. Useful for content-depth signals. */
  wordCount: number;
  /** First 280 chars of cleaned text — quick eyeball of what survived. */
  preview: string;
};

export type SchemaValidationResult = {
  /** 0..100 — coverage of the required entity field set. */
  score: number;
  /** Fields found and well-formed. */
  presentFields: string[];
  /** Fields missing entirely. */
  missingFields: string[];
  /** Fields present but ill-formed (e.g. address missing required sub-fields). */
  malformedFields: string[];
  /** schema.org @type values detected across all blocks. */
  detectedTypes: string[];
  /** Total number of <script type="application/ld+json"> blocks parsed. */
  rawJsonLdCount: number;
  /** Free-form notes — invariants checked, edge cases hit. */
  notes: string[];
};

export type CrawlabilityResult = {
  /** 0..100 — fraction of crawlability checks passed. */
  score: number;
  /** Positive findings (e.g. "robots.txt allows all crawlers"). */
  findings: string[];
  /** Soft warnings (e.g. "canonical points to a different host"). */
  warnings: string[];
  /** Checks that passed. */
  passedChecks: string[];
  /** Checks that failed. */
  failedChecks: string[];
};

export type EntityConsistencyResult = {
  /** 0..100 — overall entity-consistency score. */
  score: number;
  /** Extracted entity values per surface, plus the reference (schema). */
  extractedEntities: {
    name: { schema: string | null; homepage: string | null; footer: string | null };
    phone: { schema: string | null; homepage: string | null; footer: string | null };
    address: { schema: string | null; homepage: string | null; footer: string | null };
  };
  /** Human-readable inconsistencies found. */
  inconsistencies: string[];
  /** 0..1 — fraction of surfaces where entity values agree with the schema reference. */
  confidence: number;
};

export type PreflightSignals = {
  /** Whether the overall preflight run completed without a fatal error. */
  ok: boolean;
  /** Total wall-clock time for the entire preflight run. */
  runDurationMs: number;
  /** URL that was fetched (after redirect-follow). */
  fetchedUrl: string | null;
  /** HTTP fetch succeeded. */
  fetchOk: boolean;
  /** Populated only when fetchOk=false. */
  fetchError?: string;
  /** Module results — null when the module failed or wasn't reached. */
  readability: ReadableContentResult | null;
  schema: SchemaValidationResult | null;
  crawlability: CrawlabilityResult | null;
  entityConsistency: EntityConsistencyResult | null;
  /** Engine version for queryability across schema changes. */
  engineVersion: string;
};

export const PREFLIGHT_ENGINE_VERSION = "v1";
