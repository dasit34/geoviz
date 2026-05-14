/**
 * V2 Stage 2 — Render eligibility check.
 *
 * Decides whether the optional render pass should run for a given
 * audit. Render is the most expensive step in the V2 pipeline
 * (typically 5–15s wall-clock + ~50MB peak memory for a headless
 * browser), so this gate exists to avoid running it on audits where
 * raw HTML extraction was clearly sufficient.
 *
 * The decision rule is OR-of-positive-signals: any one of the
 * following is enough to mark a row eligible.
 *
 *   1. Framework looks SPA-shaped (React, Next.js, Vue, Nuxt, Svelte).
 *   2. Raw text length is suspiciously low (page may be a JS shell).
 *   3. Content density is low (under 200 — same threshold as
 *      `thin_content` in Stage 1).
 *   4. The raw HTML has zero detected schema types — render may
 *      surface JSON-LD that gets injected after hydration.
 *   5. The raw snapshot itself flagged `looksLikeShell=true`.
 *   6. Explicit operator override (`operatorForce=true`).
 *
 * The orchestrator combines this with the env gate
 * (`GEO_RENDER_ENABLED`) — eligibility says "should we", env gate
 * says "are we allowed to right now". Both must pass.
 *
 * This module is pure; no I/O, no async. Trivial to unit-test.
 */

import type { RawPageSnapshot } from "./renderProvider";

/** Same threshold the Stage 1 `thin_content` tag uses. */
const CONTENT_DENSITY_THIN_THRESHOLD = 200;

/** Conservative: under 800 bytes of raw visible text is "suspiciously low". */
const RAW_TEXT_LOW_THRESHOLD = 800;

/** Frameworks where render almost always reveals more content than raw HTML. */
const SPA_FRAMEWORK_PATTERNS = ["react", "nextjs", "next", "vue", "nuxt", "svelte"];

export type EligibilityDecision = {
  eligible: boolean;
  /** Short snake_case reason string — emitted in `[geo-render] eligibility` logs. */
  reason: string;
  /** All matched signals — for telemetry / debugging. */
  signals: string[];
};

export function shouldRender(args: {
  /** From Stage 1 `IntelligenceIngestResult.frameworkDetected`. */
  frameworkDetected: string | null;
  /** From Stage 1 `IntelligenceIngestResult.contentDensity`. */
  contentDensity: number | null;
  /** Pre-fetched raw page snapshot, if available. Null = no raw fetch ran. */
  rawSnapshot: RawPageSnapshot | null;
  /** Explicit override — operator forces a render regardless of signals. */
  operatorForce?: boolean;
}): EligibilityDecision {
  const signals: string[] = [];

  if (args.operatorForce === true) {
    signals.push("operator_force");
    return { eligible: true, reason: "operator_force", signals };
  }

  const fw = (args.frameworkDetected ?? "").toLowerCase();
  if (fw.length > 0 && SPA_FRAMEWORK_PATTERNS.some((p) => fw.includes(p))) {
    signals.push(`framework:${fw}`);
  }

  if (
    args.contentDensity !== null &&
    args.contentDensity < CONTENT_DENSITY_THIN_THRESHOLD
  ) {
    signals.push(`content_density_low:${args.contentDensity}`);
  }

  if (args.rawSnapshot) {
    if (args.rawSnapshot.textLength < RAW_TEXT_LOW_THRESHOLD) {
      signals.push(`raw_text_low:${args.rawSnapshot.textLength}`);
    }
    if (args.rawSnapshot.schemaTypes.length === 0) {
      signals.push("schema_missing");
    }
    if (args.rawSnapshot.looksLikeShell) {
      signals.push("looks_like_shell");
    }
  }

  if (signals.length === 0) {
    return { eligible: false, reason: "no_signal", signals: [] };
  }

  return { eligible: true, reason: signals[0]!, signals };
}
