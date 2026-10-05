/**
 * `check_business_visibility` — the GeoViz ChatGPT plugin's one tool.
 *
 * A website AI-readiness check of a business's public homepage. It runs the
 * EXACT free `/check` analysis (`runFreeCheckDetailed` → `deriveChecks`); the
 * score and findings are that check's output, never re-scored here. What this
 * module adds is only the plugin boundary:
 *   - stricter input + network rules (SSRF-safe fetcher, size/time caps),
 *   - rate limits sized for ChatGPT traffic (shared OpenAI egress IPs),
 *   - factual evidence lines read from the analyzer signals,
 *   - a fixed claim boundary: no AI system was asked about the business.
 *
 * Read-only: no database writes, no email, no customer or audit data, no
 * paid provider calls.
 */
import { z } from "zod";

import { normalizeDomain } from "@/lib/business/normalize-domain";
import { runFreeCheckDetailed, type FreeCheckSignals } from "@/lib/free-check/runFreeCheck";
import type { CheckResult } from "@/lib/free-check/types";
import { checkUrlShape, type Resolver, type Transport } from "@/lib/monitoring/website/safe-fetch";
import { checkRateLimit } from "@/lib/rate-limit";

import { createSafeHtmlFetcher } from "@/lib/free-check/safe-html-fetcher";

import { isCached, withFetchCache } from "./fetch-cache";

export const TOOL_NAME = "check_business_visibility";
export const CHECK_TYPE = "website_ai_readiness";
export const SCORE_LABEL = "Website AI-readiness (free check)";
export const DISCLAIMER =
  "This is a website AI-readiness check of public pages. GeoViz did not ask ChatGPT, Claude, Gemini, or Perplexity about this business; it does not show whether any AI system recommends it.";
const TOOL_DEADLINE_MS = 20_000;
const WINDOW_MS = 10 * 60_000;
export const LIMITS = { perClient: 10, perDomain: 3, global: 60 } as const;

// ── Input ──────────────────────────────────────────────────────────────
export const inputShape = {
  websiteUrl: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .describe("The business website to check, e.g. https://example.com"),
  businessName: z.string().trim().min(2).max(200).optional().describe("Business name as customers know it (improves the identity check)"),
  city: z.string().trim().max(100).optional().describe("City the business serves"),
  state: z.string().trim().max(100).optional().describe("State or region the business serves"),
};
const inputSchema = z.object(inputShape);
export type CheckBusinessVisibilityInput = z.infer<typeof inputSchema>;

// ── Output ─────────────────────────────────────────────────────────────
const findingSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["strong", "needs_improvement", "missing", "not_applicable"]),
  explanation: z.string(),
});
export const outputShape = {
  checkType: z.literal(CHECK_TYPE),
  business: z.object({
    name: z.string(),
    nameProvided: z.boolean(),
    city: z.string().nullable(),
    state: z.string().nullable(),
  }),
  businessType: z.enum(["local", "online"]),
  websiteChecked: z.string(),
  score: z.number().int().min(0).max(100),
  scoreLabel: z.literal(SCORE_LABEL),
  findings: z.array(findingSchema),
  priorityImprovements: z.array(z.string()).max(3),
  evidence: z.array(z.string()),
  checkedAt: z.string(),
  // Non-transactional pages only (OpenAI plugin guidelines: no links to checkout).
  links: z.object({ freeCheck: z.string(), exampleReport: z.string() }),
  aiSystemsQueried: z.array(z.string()).max(0),
  disclaimer: z.literal(DISCLAIMER),
};
const outputSchema = z.object(outputShape);
export type CheckBusinessVisibilityOutput = z.infer<typeof outputSchema>;

export type ToolResult =
  | { ok: true; output: CheckBusinessVisibilityOutput; text: string }
  | { ok: false; kind: FailureKind; message: string };

type FailureKind =
  | "invalid_input"
  | "blocked_target"
  | "rate_limited"
  | "timeout"
  | "too_large"
  | "unreachable"
  | "not_html"
  | "internal";

export type CheckDeps = {
  /** Hashed client identifier (never a raw IP). */
  clientKey: string;
  resolver?: Resolver;
  transport?: Transport;
  now?: () => Date;
  siteUrl?: string;
  deadlineMs?: number;
};

// ── Entry point ────────────────────────────────────────────────────────
export async function checkBusinessVisibility(rawInput: unknown, deps: CheckDeps): Promise<ToolResult> {
  const started = Date.now();
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return finish(deps, null, started, fail("invalid_input", "Please provide a website address like https://example.com (and, optionally, a business name, city, and state)."));
  }
  const input = parsed.data;
  const url = toUrl(input.websiteUrl);
  const shape = url ? checkUrlShape(url) : null;
  const domain = url ? normalizeDomain(url) : null;
  if (!url || !shape || !shape.ok || !domain) {
    const reason = shape && !shape.ok ? shape.reason : "invalid";
    const blocked = /private|reserved|non-public/.test(reason);
    return finish(
      deps,
      null,
      started,
      blocked
        ? fail("blocked_target", "That address isn't a public business website, so GeoViz won't fetch it.")
        : fail("invalid_input", "That doesn't look like a public website address. Use a normal http(s) URL with no username, password, or custom port."),
    );
  }

  // A fresh cached copy means no new request to the website, so only the
  // per-client limit applies (repeat checks don't hit "try again later").
  const limited = applyLimits(deps.clientKey, domain, !isCached(url));
  if (limited) return finish(deps, domain, started, limited);

  const net = createSafeHtmlFetcher(url, { resolver: deps.resolver, transport: deps.transport });
  const nameProvided = Boolean(input.businessName);
  const businessName = input.businessName ?? domainLabel(domain);

  const deadlineMs = deps.deadlineMs ?? TOOL_DEADLINE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), deadlineMs);
  });
  let detailed: Awaited<ReturnType<typeof runFreeCheckDetailed>> | "deadline";
  try {
    detailed = await Promise.race([
      runFreeCheckDetailed(
        { websiteUrl: url, businessName, city: input.city ?? "", state: input.state ?? "", category: "" },
        { fetcher: withFetchCache(net.fetcher) },
      ),
      deadline,
    ]);
  } catch {
    return finish(deps, domain, started, fail("internal", "The check couldn't be completed. Please try again later."));
  } finally {
    clearTimeout(timer);
  }

  if (detailed === "deadline") {
    return finish(deps, domain, started, fail("timeout", "The website took too long to respond. Try again in a moment."));
  }
  if (detailed.signals === null) {
    return finish(deps, domain, started, homepageFailure(net.homepageOutcome()?.kind));
  }

  const { result, signals, finalUrl } = detailed;
  const siteUrl = (deps.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.geoviz.ai").replace(/\/+$/, "");
  const output: CheckBusinessVisibilityOutput = {
    checkType: CHECK_TYPE,
    business: {
      name: businessName,
      nameProvided,
      city: input.city || null,
      state: input.state || null,
    },
    businessType: result.businessType,
    websiteChecked: finalUrl,
    score: result.overallScore,
    scoreLabel: SCORE_LABEL,
    findings: result.checks.map((c: CheckResult) => ({ id: c.id, label: c.label, status: c.status, explanation: c.explanation })),
    priorityImprovements: result.fixes.slice(0, 3),
    evidence: [businessTypeEvidence(result.businessType, result.businessTypeReasons), ...buildEvidence(signals, nameProvided, result.businessType)],
    checkedAt: (deps.now ?? (() => new Date()))().toISOString(),
    links: {
      freeCheck: `${siteUrl}/check`,
      exampleReport: `${siteUrl}/sample-report`,
    },
    aiSystemsQueried: [],
    disclaimer: DISCLAIMER,
  };
  return finish(deps, domain, started, { ok: true, output, text: summarize(output) });
}

// ── Helpers ────────────────────────────────────────────────────────────
function fail(kind: FailureKind, message: string): ToolResult {
  return { ok: false, kind, message };
}

function toUrl(raw: string): string | null {
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

function domainLabel(domain: string): string {
  const root = domain.split(".")[0] ?? domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function applyLimits(clientKey: string, domain: string, fetchesWebsite: boolean): ToolResult | null {
  const checks = [
    checkRateLimit(`mcp:check:client:${clientKey}`, LIMITS.perClient, WINDOW_MS),
    ...(fetchesWebsite
      ? [
          checkRateLimit(`mcp:check:domain:${domain}`, LIMITS.perDomain, WINDOW_MS),
          checkRateLimit("mcp:check:global", LIMITS.global, WINDOW_MS),
        ]
      : []),
  ];
  const blocked = checks.find((r) => !r.allowed);
  if (!blocked) return null;
  const minutes = Math.max(1, Math.ceil(blocked.retryAfterSec / 60));
  return fail("rate_limited", `GeoViz has run this check several times recently. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
}

function homepageFailure(kind: string | undefined): ToolResult {
  switch (kind) {
    case "blocked_unsafe":
      return fail("blocked_target", "That address isn't a public business website, so GeoViz won't fetch it.");
    case "redirect_offsite":
      return fail("unreachable", "The website redirected to a different site, so GeoViz stopped. Try the address it redirects to.");
    case "timeout":
      return fail("timeout", "The website took too long to respond. Try again in a moment.");
    case "too_large":
      return fail("too_large", "The homepage is larger than GeoViz checks (1.5 MB), so it wasn't analyzed.");
    case "not_html":
      return fail("not_html", "That address didn't return a web page.");
    case "access_denied":
      return fail("unreachable", "The website refused the request (HTTP 401/403). GeoViz doesn't bypass access restrictions.");
    default:
      return fail("unreachable", "GeoViz couldn't load that website. Double-check the address and try again.");
  }
}

function businessTypeEvidence(type: "local" | "online", reasons: string[]): string {
  return type === "online"
    ? `Scored as an online business, so storefront location and opening hours aren't scored. Reason: ${reasons.join("; ")}.`
    : "Scored as a local business: location, address, and opening-hours signals are included.";
}

const SAFE_TYPE = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

/** Factual lines read straight from analyzer outputs — no inference. */
export function buildEvidence(signals: FreeCheckSignals, nameProvided: boolean, businessType: "local" | "online" = "local"): string[] {
  const lines: string[] = [];
  const { schema, crawlability, readability, entityConsistency } = signals;

  if (schema) {
    const types = Array.from(new Set(schema.detectedTypes.filter((t) => SAFE_TYPE.test(t)))).slice(0, 6);
    lines.push(
      schema.rawJsonLdCount === 0
        ? "No JSON-LD structured data found on the homepage."
        : `Structured data: ${schema.rawJsonLdCount} JSON-LD block${schema.rawJsonLdCount === 1 ? "" : "s"}${types.length ? ` (types: ${types.join(", ")})` : ""}.`,
    );
    if (businessType === "online") {
      // Online businesses are scored on Organization / WebSite / product schema, not LocalBusiness fields.
      const items = signals.onlineSchema?.items ?? [];
      const present = items.filter((i) => i.present).map((i) => i.label);
      const missing = items.filter((i) => !i.present).map((i) => i.label);
      if (present.length) lines.push(`Online business schema present: ${present.join("; ")}.`);
      if (missing.length) lines.push(`Online business schema missing: ${missing.join("; ")}.`);
    } else {
      const fields = (xs: string[]) => xs.filter((f) => SAFE_TYPE.test(f)).slice(0, 8).join(", ");
      if (schema.presentFields.length) lines.push(`Business fields present in structured data: ${fields(schema.presentFields)}.`);
      if (schema.missingFields.length) lines.push(`Business fields missing from structured data: ${fields(schema.missingFields)}.`);
    }
  } else {
    lines.push("Structured data could not be analyzed.");
  }

  if (crawlability) {
    const has = (c: string) => crawlability.passedChecks.includes(c);
    const failed = (c: string) => crawlability.failedChecks.includes(c);
    lines.push(has("robots_txt_exists") ? (failed("robots_txt_not_blocking_all") ? "robots.txt found and it blocks all crawlers." : "robots.txt found and it does not block all crawlers.") : "No robots.txt found.");
    lines.push(has("sitemap_xml_present") ? "sitemap.xml found." : "No valid sitemap.xml found.");
    if (failed("homepage_not_noindex")) lines.push('Homepage has a "noindex" robots meta tag.');
    lines.push(has("canonical_present") ? "Homepage declares a canonical URL." : "Homepage has no canonical URL.");
  }

  if (readability) {
    lines.push(`Readable homepage text: about ${readability.wordCount} words.`);
  }

  if (entityConsistency) {
    const n = entityConsistency.inconsistencies.length;
    lines.push(
      n === 0
        ? "No name, phone, or address mismatches found between structured data, homepage, and footer."
        : `${n} name/phone/address mismatch${n === 1 ? "" : "es"} found between structured data, homepage, and footer.`,
    );
  }

  if (!nameProvided) {
    lines.push("No business name was provided, so the identity check used the domain name. Add the business name for a more accurate result.");
  }
  return lines;
}

function summarize(o: CheckBusinessVisibilityOutput): string {
  const findings = o.findings.map((f) => `- ${f.label}: ${f.status.replaceAll("_", " ")}`).join("\n");
  const fixes = o.priorityImprovements.map((f, i) => `${i + 1}. ${f}`).join("\n");
  return [
    `${SCORE_LABEL} for ${o.business.name} (${o.websiteChecked}): ${o.score}/100, checked ${o.checkedAt}.`,
    "",
    "Findings:",
    findings,
    "",
    fixes ? `Top improvements:\n${fixes}` : "No priority improvements were flagged.",
    "",
    `Evidence:\n${o.evidence.map((e) => `- ${e}`).join("\n")}`,
    "",
    o.disclaimer,
    `Free website check: ${o.links.freeCheck} · Example GeoViz report: ${o.links.exampleReport}`,
  ].join("\n");
}

function finish(deps: CheckDeps, domain: string | null, started: number, result: ToolResult): ToolResult {
  const outcome = result.ok ? "ok" : result.kind;
  // Secret-safe: hashed client key, normalized domain, outcome, timing only.
  console.info(`[chatgpt-plugin] tool=${TOOL_NAME} domain=${domain ?? "-"} outcome=${outcome} ms=${Date.now() - started} client=${deps.clientKey}`);
  return result;
}
