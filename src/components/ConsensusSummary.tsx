import { InlineProse } from "@/components/Prose";
import { SECTION_EYEBROWS } from "@/lib/report-sections";
import { stripMarkdownMarkers } from "@/lib/parse-report";
import {
  asNonNegativeScore,
  asRecommendationMajority,
  deriveConsensusConfidenceLabel,
} from "@/lib/intelligence/derive-consensus-label";

/**
 * AI Consensus Summary — report v2.
 *
 * Plain-English distillation of the cross-model consensus data.
 * Lives between the four-model grid and the existing
 * CrossModelIntelligence card (which carries the technical
 * Confidence Index / verdict strip).
 *
 * Reads from:
 *   - aiValidations.outputs[] — to count how many systems passed
 *     and infer which dimensions had agreement.
 *   - consensusIndex.agreement_metrics — to read the majority
 *     confidence labels per axis (category, service area,
 *     recommendation).
 *
 * Fail-soft: when aiValidations or consensusIndex is null/empty, or
 * fewer than 2 providers passed (preserving the N>=2 rule from the
 * Scoring Constitution), the section renders an "AI model analysis
 * unavailable for this audit." panel — the customer always sees
 * the heading + the explicit absence rather than a silent omission.
 *
 * The "Overall AI Recommendation Confidence" label is a CONFIDENCE
 * LABEL, not a score. It's derived from passed-count + majority
 * agreement. Never rewrites the deterministic GeoViz score and never
 * exposes the canonical consensus_confidence value as a score.
 */

type ValidatorOutputShape = {
  provider: string;
  status: string;
  category_confidence: string | null;
  service_area_confidence: string | null;
  recommendation_confidence: string | null;
  industry_identified?: string;
  location_identified?: string;
  services_identified?: string[];
  missing_facts?: string[];
};

type DimensionShape = {
  score?: number;
};

type ConsensusShape = {
  agreement_metrics?: {
    providers_passed?: number;
    providers_failed?: number;
    providers_unavailable?: number;
    category_confidence_majority?: string | null;
    service_area_confidence_majority?: string | null;
    recommendation_confidence_majority?: string | null;
    agreement_label?: string;
  };
  dimensions?: {
    business_identity?: DimensionShape;
    schema_quality?: DimensionShape;
    trust_signals?: DimensionShape;
    service_clarity?: DimensionShape;
    coverage_depth?: DimensionShape;
    recommendation_readiness?: DimensionShape;
  };
  bullets_raw?: ConsensusBulletsShape | null;
  bullets_polished?: ConsensusBulletsShape | null;
  model_agreement?: string;
};

type ConsensusBulletsShape = {
  agreed?: string[];
  uncertain?: string[];
  missing?: string[];
  barriers?: string[];
};

type ValidatorLayer = {
  outputs?: ValidatorOutputShape[];
} | null;

type ConfidenceLabel = "LOW" | "MODERATE" | "HIGH";

// The recommendation-confidence label cascade now lives in the shared
// `deriveConsensusConfidenceLabel` helper so this section and the
// ConsensusActionAnchor nudge can never silently desync. See
// src/lib/intelligence/derive-consensus-label.ts for the rule
// documentation and the frozen-surface note.

function confidenceToneClass(c: ConfidenceLabel): string {
  switch (c) {
    case "HIGH":
      return "text-severity-info";
    case "MODERATE":
      return "text-severity-warning";
    case "LOW":
      return "text-severity-critical";
  }
}

function countConfidence(
  outputs: ValidatorOutputShape[],
  axis:
    | "category_confidence"
    | "service_area_confidence"
    | "recommendation_confidence",
  level: "low" | "medium" | "high",
): number {
  return outputs.filter(
    (o) => o.status === "passed" && o[axis] === level,
  ).length;
}

// Report Polish P5 — five-part consensus structure derived directly
// from validator outputs + consensus metrics. Replaces the prior
// 4-group bullets render (agreed / uncertain / missing / barriers)
// with the user-specified group labels and business-name-aware copy.
//
// buildConsensusBullets() in src/lib/consensus/ stays untouched —
// this is a render-layer reorganization only.

type FivePartConsensus = {
  businessType: string[];
  serviceCategory: string[];
  locationUnderstanding: string[];
  missingTrustSignals: string[];
  missingRecommendationSignals: string[];
  // True only when every agreement-bearing bullet (business type,
  // service category, location) reflects strict 4/4 unanimity. Drives
  // the section header — "WHERE ALL AI SYSTEMS AGREED" must not appear
  // when underlying bullets read "X of N agreed."
  everyAgreementUnanimous: boolean;
};

function pickMajorityString(values: string[]): string | null {
  const counts = new Map<string, { display: string; count: number }>();
  for (const v of values) {
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { display: trimmed, count: 1 });
  }
  let best: { display: string; count: number } | null = null;
  for (const e of counts.values()) {
    if (!best || e.count > best.count) best = e;
  }
  return best ? best.display : null;
}

const TRUST_KEYWORDS =
  /\b(trust|review|credential|license|certif|badge|testimonial|bbb|accred|insurance|warranty|guarantee|verified)\b/i;

function buildFivePart(
  outputs: ValidatorOutputShape[],
  metrics: ConsensusShape["agreement_metrics"],
  businessName: string,
): FivePartConsensus {
  const passed = outputs.filter((o) => o.status === "passed");
  const N = passed.length;
  const name = businessName || "your business";

  const out: FivePartConsensus = {
    businessType: [],
    serviceCategory: [],
    locationUnderstanding: [],
    missingTrustSignals: [],
    missingRecommendationSignals: [],
    everyAgreementUnanimous: true,
  };
  // Track whether any agreement-bearing bullet was emitted at all —
  // an empty agreement section is not "unanimous," it's empty.
  let anyAgreementEmitted = false;

  // Launch Blocker P2 #6 — section is titled "Where All AI Systems
  // Agreed" so it must only contain actual agreement. The threshold is
  // a strict majority on the SAME value (not just majority of
  // providers that returned ANY industry). Below-majority cases are
  // intentionally dropped — the section can render fewer than 5
  // groups when systems didn't reach consensus on a dimension.
  const industries = passed
    .map((o) => o.industry_identified ?? "")
    .filter((s) => s.length > 0);
  const majorityIndustry = pickMajorityString(industries);
  const industryAgreeingCount = majorityIndustry
    ? industries.filter(
        (s) => s.toLowerCase() === majorityIndustry.toLowerCase(),
      ).length
    : 0;
  if (majorityIndustry && industryAgreeingCount >= Math.ceil(N / 2)) {
    if (industryAgreeingCount === N) {
      out.businessType.push(
        `All ${N} AI systems identified ${name} as a ${majorityIndustry.toLowerCase().replace(/\.$/, "")}.`,
      );
      anyAgreementEmitted = true;
    } else {
      out.businessType.push(
        `${industryAgreeingCount} of ${N} AI systems identified ${name} as a ${majorityIndustry.toLowerCase().replace(/\.$/, "")}.`,
      );
      anyAgreementEmitted = true;
      out.everyAgreementUnanimous = false;
    }
  } else if (metrics?.category_confidence_majority === "high") {
    out.businessType.push(
      `${N} AI systems confidently identified the type of business ${name} operates.`,
    );
    anyAgreementEmitted = true;
    out.everyAgreementUnanimous = false;
  }
  // No filler when systems disagreed — the customer reads disagreement
  // as a real finding, not as the system failing. The Cross-Model
  // section surfaces actual disagreement separately.

  // Service category — shared services across providers
  const serviceFreq = new Map<string, { display: string; count: number }>();
  for (const o of passed) {
    if (!Array.isArray(o.services_identified)) continue;
    const seenInProv = new Set<string>();
    for (const s of o.services_identified) {
      const display = s.trim();
      if (!display) continue;
      const key = display.toLowerCase();
      if (seenInProv.has(key)) continue;
      seenInProv.add(key);
      const prev = serviceFreq.get(key);
      if (prev) prev.count += 1;
      else serviceFreq.set(key, { display, count: 1 });
    }
  }
  const sharedServices = Array.from(serviceFreq.values())
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  if (sharedServices.length > 0) {
    out.serviceCategory.push(
      `Shared service understanding: ${sharedServices.map((s) => s.display).join(", ")}.`,
    );
    anyAgreementEmitted = true;
    // "Shared services" is a 2+ majority signal, not strict 4/4 — the
    // services need not be agreed by ALL providers to surface here.
    out.everyAgreementUnanimous = false;
  } else if (metrics?.category_confidence_majority === "high") {
    out.serviceCategory.push(
      `AI systems agreed on the broad service category ${name} operates in.`,
    );
    anyAgreementEmitted = true;
    out.everyAgreementUnanimous = false;
  }
  // No filler when systems disagreed — group will be hidden by the
  // render layer's empty-group filter.

  // Location understanding
  const locations = passed
    .map((o) => o.location_identified ?? "")
    .filter((s) => s.length > 0);
  const majorityLocation = pickMajorityString(locations);
  const svcMajority = metrics?.service_area_confidence_majority;
  // Same strict-majority rule as business type: only emit a location
  // bullet when an actual majority of AI systems agreed on the same
  // location string. Otherwise leave the group empty so the render
  // filter drops it.
  const locationAgreeingCount = majorityLocation
    ? locations.filter(
        (s) => s.toLowerCase() === majorityLocation.toLowerCase(),
      ).length
    : 0;
  if (majorityLocation && locationAgreeingCount >= Math.ceil(N / 2)) {
    if (locationAgreeingCount === N) {
      out.locationUnderstanding.push(
        `All ${N} AI systems identified ${name}'s service area as ${majorityLocation}.`,
      );
      anyAgreementEmitted = true;
    } else {
      out.locationUnderstanding.push(
        `${locationAgreeingCount} of ${N} AI systems identified ${name}'s service area as ${majorityLocation}.`,
      );
      anyAgreementEmitted = true;
      out.everyAgreementUnanimous = false;
    }
  } else if (svcMajority === "high") {
    out.locationUnderstanding.push(
      `Most AI systems read ${name}'s geographic service area confidently.`,
    );
    anyAgreementEmitted = true;
    out.everyAgreementUnanimous = false;
  }
  // No filler for low/mixed — the absence of a confident location read
  // is itself a finding that belongs in the Missing Recommendation
  // Signals group below, not under "Agreed."

  // Missing facts pool, dedupe by lowercased substring, categorize
  const factPool = new Map<string, { display: string; count: number }>();
  for (const o of passed) {
    if (!Array.isArray(o.missing_facts)) continue;
    const seenInProv = new Set<string>();
    for (const raw of o.missing_facts) {
      if (typeof raw !== "string") continue;
      const display = raw.trim().replace(/[\.;,!?]+$/g, "");
      if (!display) continue;
      const key = display.toLowerCase();
      if (seenInProv.has(key)) continue;
      seenInProv.add(key);
      const prev = factPool.get(key);
      if (prev) prev.count += 1;
      else factPool.set(key, { display, count: 1 });
    }
  }
  const shared = Array.from(factPool.values()).filter((e) => e.count >= 2);
  const trustItems = shared
    .filter((e) => TRUST_KEYWORDS.test(e.display))
    .slice(0, 4);
  const otherItems = shared
    .filter((e) => !TRUST_KEYWORDS.test(e.display))
    .slice(0, 4);

  // Launch Blocker P2 #8 — emit Missing Trust Signals ONLY when
  // there are real findings or a low-confidence majority. The prior
  // "No specific gaps surfaced" filler bullets read as the system
  // failing to find issues, not as actually clean. Empty groups are
  // hidden by the render layer.
  if (trustItems.length > 0) {
    for (const t of trustItems) {
      out.missingTrustSignals.push(
        t.display.charAt(0).toUpperCase() + t.display.slice(1),
      );
    }
  } else if (metrics?.recommendation_confidence_majority === "low") {
    out.missingTrustSignals.push(
      `${name} lacks consistent trust signals (reviews, credentials, third-party verification) that AI systems weigh heavily.`,
    );
  }

  if (otherItems.length > 0) {
    for (const o2 of otherItems) {
      out.missingRecommendationSignals.push(
        o2.display.charAt(0).toUpperCase() + o2.display.slice(1),
      );
    }
  } else if (metrics?.recommendation_confidence_majority === "low") {
    out.missingRecommendationSignals.push(
      `AI systems lack the surrounding context (clear service area, pricing direction, hours) to confidently recommend ${name}.`,
    );
  }

  // No agreement bullets emitted at all → header cannot honestly claim
  // "all AI systems agreed." Empty agreement ≠ unanimous agreement.
  if (!anyAgreementEmitted) out.everyAgreementUnanimous = false;
  return out;
}

function UnavailablePanel() {
  return (
    <section
      className="report-section-card mt-10"
      aria-label="AI consensus summary — unavailable"
    >
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.aiConsensusSummary}</p>
      </div>
      <h2 className="h2 mt-3">AI consensus summary.</h2>
      <p className="muted mt-3 text-sm leading-relaxed">
        AI model analysis unavailable for this audit.
      </p>
    </section>
  );
}

export function ConsensusSummary({
  aiValidations,
  consensusIndex,
  businessName,
}: {
  aiValidations: unknown;
  consensusIndex: unknown;
  businessName?: string;
}) {
  const layer = aiValidations as ValidatorLayer;
  const consensus = consensusIndex as ConsensusShape | null;
  if (!layer || !Array.isArray(layer.outputs) || layer.outputs.length === 0) {
    return <UnavailablePanel />;
  }
  if (!consensus || typeof consensus !== "object") {
    return <UnavailablePanel />;
  }
  const metrics = consensus.agreement_metrics ?? {};
  const passedOutputs = layer.outputs.filter((o) => o.status === "passed");
  const passedCount =
    typeof metrics.providers_passed === "number"
      ? metrics.providers_passed
      : passedOutputs.length;
  if (passedCount < 2) return <UnavailablePanel />;

  // Confidence label inputs — correctness fix lands here. Pull
  // deterministic dimension scores out of the existing consensusIndex
  // payload (already persisted, no schema change required) and the
  // recommendation-confidence majority across the passed providers.
  const trustSignalsScore = asNonNegativeScore(
    consensus.dimensions?.trust_signals?.score,
  );
  const recommendationReadinessScore = asNonNegativeScore(
    consensus.dimensions?.recommendation_readiness?.score,
  );
  const recommendationMajority = asRecommendationMajority(
    metrics.recommendation_confidence_majority,
  );

  const overall = deriveConsensusConfidenceLabel(
    passedCount,
    metrics.agreement_label,
    recommendationMajority,
    trustSignalsScore,
    recommendationReadinessScore,
  );

  // Report Polish P5 — five-part structure derived directly from
  // validator outputs + consensus metrics + the businessName prop.
  // The deterministic buildConsensusBullets() output stays available
  // as a render fallback for legacy audits but is no longer the
  // primary source on fresh audits.
  const safeName = businessName?.trim() ?? "";
  const fivePart = buildFivePart(layer.outputs, metrics, safeName);
  const groups: Array<{ label: string; items: string[] }> = [
    { label: "Business type identified", items: fivePart.businessType },
    { label: "Service category identified", items: fivePart.serviceCategory },
    { label: "Location understanding", items: fivePart.locationUnderstanding },
    { label: "Missing trust signals", items: fivePart.missingTrustSignals },
    {
      label: "Missing recommendation signals",
      items: fivePart.missingRecommendationSignals,
    },
  ].filter((g) => g.items.length > 0);

  // Legacy 3-line distillation kept for audits whose outputs lack
  // the rich fields the 5-part derivation depends on. In practice
  // buildFivePart always produces at least one fallback sentence per
  // group, so this only fires on truly empty / corrupt records.
  const fallbackLines = groups.length === 0
    ? buildLegacyLines(layer.outputs, passedCount)
    : null;

  // F4 — only label the section "all agreed" when every agreement
  // bullet emitted by buildFivePart reflects strict 4/4 unanimity.
  // Otherwise downgrade honestly to "mostly agreed."
  const sectionEyebrow = fivePart.everyAgreementUnanimous
    ? "Where all AI systems agreed"
    : "Where AI systems mostly agreed";
  const sectionTitle = fivePart.everyAgreementUnanimous
    ? "Where all the AI systems agree."
    : "AI consensus summary.";

  return (
    <section
      className="report-section-card mt-10"
      aria-label={sectionEyebrow}
    >
      <div className="report-section-card-header">
        <p className="section-eyebrow">{sectionEyebrow}</p>
        <span className="pill">{passedCount} AI Systems</span>
      </div>
      <h2 className="h2 mt-3">{sectionTitle}</h2>
      {groups.length > 0 ? (
        <div className="mt-5 space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                {g.label}
              </p>
              <ul className="mt-2 space-y-1.5">
                {g.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[13px] leading-relaxed text-white/80"
                  >
                    <span aria-hidden className="mt-[6px] text-white/30">
                      •
                    </span>
                    <span>
                      <InlineProse>{stripMarkdownMarkers(item)}</InlineProse>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : fallbackLines ? (
        <ul className="mt-5 space-y-2">
          {fallbackLines.map((line, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-[13px] leading-relaxed text-white/80"
            >
              <span aria-hidden className="mt-[6px] text-white/30">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/[0.05] pt-4">
        <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">
          Cross-model agreement
        </span>
        <span
          className={`mono-data text-sm font-semibold ${confidenceToneClass(overall)}`}
        >
          {overall}
        </span>
      </div>
      <p className="muted mt-3 text-[11px] leading-relaxed">
        Cross-model agreement measures how strongly the four AI
        systems converged on this audit&apos;s findings. It is a
        separate read from the audit-completeness label on the score
        card, and is never used as a score in itself.
      </p>
    </section>
  );
}

function pickBullets(
  polished: ConsensusBulletsShape | null | undefined,
  raw: ConsensusBulletsShape | null | undefined,
): ConsensusBulletsShape | null {
  const candidates = [polished, raw];
  for (const c of candidates) {
    if (!c) continue;
    const total =
      (c.agreed?.length ?? 0) +
      (c.uncertain?.length ?? 0) +
      (c.missing?.length ?? 0) +
      (c.barriers?.length ?? 0);
    if (total > 0) return c;
  }
  return null;
}

function buildLegacyLines(
  outputs: ValidatorOutputShape[],
  passedCount: number,
): string[] {
  // Preserves the pre-2026-06 three-line distillation for legacy
  // consensusIndex records that lack bullets_raw / bullets_polished.
  const lines: string[] = [];
  const idHigh = countConfidence(outputs, "category_confidence", "high");
  const idMed = countConfidence(outputs, "category_confidence", "medium");
  if (idHigh >= 2) {
    lines.push(
      `All ${idHigh} AI systems clearly identified the company as the business it is.`,
    );
  } else if (idHigh + idMed >= 2) {
    lines.push(
      `${idHigh + idMed} of ${passedCount} systems identified the company with reasonable confidence.`,
    );
  } else {
    lines.push(
      `Most AI systems struggled to confidently identify the company without more signal.`,
    );
  }

  const svcHigh = countConfidence(outputs, "service_area_confidence", "high");
  const svcMed = countConfidence(outputs, "service_area_confidence", "medium");
  if (svcHigh + svcMed >= 2) {
    lines.push(
      `${svcHigh + svcMed} of ${passedCount} systems understood the services and service area offered.`,
    );
  } else {
    lines.push(
      "Most AI systems could not reliably determine the services or service area offered.",
    );
  }

  const recLow = countConfidence(outputs, "recommendation_confidence", "low");
  if (recLow >= 2) {
    lines.push(
      `All ${passedCount} systems had difficulty verifying enough trust signal to actively recommend the business.`,
    );
  } else {
    lines.push(
      `Recommendation confidence varied across the ${passedCount} systems based on the trust signals available.`,
    );
  }

  return lines;
}
