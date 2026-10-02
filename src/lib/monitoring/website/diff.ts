/**
 * Compare two successful, compatible scans of one site (pure).
 *
 * Honesty rules:
 *   - The first scan of a site is a baseline — no changes.
 *   - Scans from different scanner MAJOR versions are not compared; the
 *     newer one is a re-recorded baseline.
 *   - A page is "removed" only when this scan's direct re-check returned
 *     404/410. A timeout, 5xx, access-denied, or robots-blocked fetch is
 *     "couldn't check", never "removed".
 *   - A page is "added" only when discovery worked in both scans and the
 *     page was not seen (captured or discovered) last time.
 *   - Content changes are "material" only above a similarity + size
 *     threshold, computed over noise-filtered, date-normalized text.
 */
import { normalizeForCompare } from "./extract";
import type { PageFetchStatus } from "./scanner";

export const DIFF_VERSION = "site-diff@1.0.0";
export const MATERIAL_SIMILARITY = 0.85;
export const MATERIAL_MIN_CHARS = 200;
const EXCERPT_MAX = 300;

export type ChangeType =
  | "page_added"
  | "page_removed"
  | "title_changed"
  | "description_changed"
  | "headings_changed"
  | "schema_changed"
  | "services_changed"
  | "locations_changed"
  | "identity_changed"
  | "content_changed";

export type SnapshotForDiff = {
  url: string;
  normalizedUrl: string;
  discoveredVia: string;
  fetchStatus: PageFetchStatus | string;
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  contentBlocks: string[];
  structuredData: { types: string[]; presentFields: string[]; localBusiness: unknown | null } | null;
  identity: { name: string | null; phone: string | null; address: string | null } | null;
  services: string[];
  locations: string[];
};

export type ScanForDiff = {
  id: string;
  scannerVersion: string;
  completedAt: Date;
  discoveredUrls: string[] | null;
  discoveryComplete: boolean;
  pages: SnapshotForDiff[];
};

export type ChangeDraft = {
  changeType: ChangeType;
  url: string;
  beforeExcerpt: string | null;
  afterExcerpt: string | null;
  detail: Record<string, unknown> | null;
};

export type DiffOutcome = {
  kind: "baseline" | "baseline_rerecorded" | "compared";
  changes: ChangeDraft[];
  /** Pages this scan could not check — reported separately, never as removed. */
  uncheckable: Array<{ url: string; fetchStatus: string; httpStatus: number | null }>;
};

export function scannerMajor(version: string): string {
  const m = /@(\d+)\./.exec(version);
  return `${version.split("@")[0]}@${m ? m[1] : version}`;
}

export function excerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > EXCERPT_MAX ? `${t.slice(0, EXCERPT_MAX - 1)}…` : t;
}

const same = (a: string | null | undefined, b: string | null | undefined) => normalizeForCompare(a ?? "") === normalizeForCompare(b ?? "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const setDiff = (before: string[], after: string[]) => {
  const key = (s: string) => normalizeForCompare(s);
  const b = new Map(before.map((s) => [key(s), s]));
  const a = new Map(after.map((s) => [key(s), s]));
  return {
    added: Array.from(a.entries()).filter(([k]) => !b.has(k)).map(([, v]) => v),
    removed: Array.from(b.entries()).filter(([k]) => !a.has(k)).map(([, v]) => v),
  };
};

function shingles(text: string, n = 5): Set<string> {
  const words = text.split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < n) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + n <= words.length; i += 1) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export function contentSimilarity(before: string[], after: string[]): { similarity: number; changedChars: number; added: string[]; removed: string[] } {
  const nb = before.map(normalizeForCompare);
  const na = after.map(normalizeForCompare);
  const sb = shingles(nb.join(" "));
  const sa = shingles(na.join(" "));
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter += 1;
  const union = sb.size + sa.size - inter;
  const similarity = union === 0 ? 1 : inter / union;
  const setB = new Set(nb);
  const setA = new Set(na);
  const added = after.filter((_, i) => !setB.has(na[i]));
  const removed = before.filter((_, i) => !setA.has(nb[i]));
  const changedChars = [...added, ...removed].reduce((n, s) => n + s.length, 0);
  return { similarity, changedChars, added, removed };
}

function hasLocalBusiness(p: SnapshotForDiff): boolean {
  return !!p.structuredData?.localBusiness;
}

export function diffScans(prev: ScanForDiff | null, curr: ScanForDiff): DiffOutcome {
  const uncheckable = curr.pages
    .filter((p) => p.fetchStatus !== "ok" && !(p.fetchStatus === "not_found" && (p.httpStatus === 404 || p.httpStatus === 410)))
    .map((p) => ({ url: p.url, fetchStatus: String(p.fetchStatus), httpStatus: p.httpStatus }));
  if (!prev) return { kind: "baseline", changes: [], uncheckable };
  if (scannerMajor(prev.scannerVersion) !== scannerMajor(curr.scannerVersion)) {
    return { kind: "baseline_rerecorded", changes: [], uncheckable };
  }

  const changes: ChangeDraft[] = [];
  const prevByKey = new Map(prev.pages.map((p) => [p.normalizedUrl, p]));
  const prevSeen = new Set<string>([...prev.pages.map((p) => p.normalizedUrl), ...(prev.discoveredUrls ?? [])]);
  const reportedServices = new Set<string>();
  const reportedLocations = new Set<string>();
  const reportedSchema = new Set<string>();

  for (const c of curr.pages) {
    const p = prevByKey.get(c.normalizedUrl);

    // Added
    if (!p && c.fetchStatus === "ok") {
      if (prev.discoveryComplete && curr.discoveryComplete && !prevSeen.has(c.normalizedUrl)) {
        changes.push({
          changeType: "page_added",
          url: c.url,
          beforeExcerpt: null,
          afterExcerpt: excerpt(c.title ?? c.headings.h1[0] ?? c.contentBlocks[0]),
          detail: { h1: c.headings.h1.slice(0, 3), services: c.services.slice(0, 10), locations: c.locations.slice(0, 10) },
        });
        c.services.forEach((s) => reportedServices.add(normalizeForCompare(s)));
        c.locations.forEach((s) => reportedLocations.add(normalizeForCompare(s)));
      }
      continue;
    }
    if (!p || p.fetchStatus !== "ok") continue;

    // Confirmed removed (direct re-check returned 404/410)
    if (c.fetchStatus === "not_found" && (c.httpStatus === 404 || c.httpStatus === 410)) {
      changes.push({
        changeType: "page_removed",
        url: c.url,
        beforeExcerpt: excerpt(p.title ?? p.headings.h1[0] ?? p.contentBlocks[0]),
        afterExcerpt: null,
        detail: { httpStatus: c.httpStatus, confirmedBy: "direct re-check" },
      });
      continue;
    }
    if (c.fetchStatus !== "ok") continue; // couldn't check — never a removal

    if (!same(p.title, c.title)) {
      changes.push({ changeType: "title_changed", url: c.url, beforeExcerpt: excerpt(p.title), afterExcerpt: excerpt(c.title), detail: null });
    }
    if (!same(p.metaDescription, c.metaDescription)) {
      changes.push({ changeType: "description_changed", url: c.url, beforeExcerpt: excerpt(p.metaDescription), afterExcerpt: excerpt(c.metaDescription), detail: null });
    }
    const h1 = setDiff(p.headings.h1, c.headings.h1);
    const h2 = setDiff(p.headings.h2, c.headings.h2);
    if (h1.added.length || h1.removed.length || h2.added.length || h2.removed.length) {
      changes.push({
        changeType: "headings_changed",
        url: c.url,
        beforeExcerpt: excerpt([...h1.removed, ...h2.removed].join(" · ")),
        afterExcerpt: excerpt([...h1.added, ...h2.added].join(" · ")),
        detail: { h1, h2 },
      });
    }

    // Structured data (deduplicated across pages — sitewide schema repeats)
    const types = setDiff(p.structuredData?.types ?? [], c.structuredData?.types ?? []);
    const lbBefore = hasLocalBusiness(p);
    const lbAfter = hasLocalBusiness(c);
    const fields = setDiff(p.structuredData?.presentFields ?? [], c.structuredData?.presentFields ?? []);
    const schemaKey = JSON.stringify([types, lbBefore, lbAfter, fields]);
    if ((types.added.length || types.removed.length || lbBefore !== lbAfter || fields.removed.length || fields.added.length) && !reportedSchema.has(schemaKey)) {
      reportedSchema.add(schemaKey);
      changes.push({
        changeType: "schema_changed",
        url: c.url,
        beforeExcerpt: excerpt((p.structuredData?.types ?? []).join(", ") || "no structured data"),
        afterExcerpt: excerpt((c.structuredData?.types ?? []).join(", ") || "no structured data"),
        detail: { typesAdded: types.added, typesRemoved: types.removed, fieldsAdded: fields.added, fieldsRemoved: fields.removed, localBusinessBefore: lbBefore, localBusinessAfter: lbAfter },
      });
    }

    const svc = setDiff(p.services, c.services);
    const svcAdded = svc.added.filter((s) => !reportedServices.has(normalizeForCompare(s)));
    const svcRemoved = svc.removed.filter((s) => !reportedServices.has(`-${normalizeForCompare(s)}`));
    if (svcAdded.length || svcRemoved.length) {
      svcAdded.forEach((s) => reportedServices.add(normalizeForCompare(s)));
      svcRemoved.forEach((s) => reportedServices.add(`-${normalizeForCompare(s)}`));
      changes.push({ changeType: "services_changed", url: c.url, beforeExcerpt: excerpt(svcRemoved.join(", ")), afterExcerpt: excerpt(svcAdded.join(", ")), detail: { added: svcAdded, removed: svcRemoved } });
    }
    const loc = setDiff(p.locations, c.locations);
    const locAdded = loc.added.filter((s) => !reportedLocations.has(normalizeForCompare(s)));
    const locRemoved = loc.removed.filter((s) => !reportedLocations.has(`-${normalizeForCompare(s)}`));
    if (locAdded.length || locRemoved.length) {
      locAdded.forEach((s) => reportedLocations.add(normalizeForCompare(s)));
      locRemoved.forEach((s) => reportedLocations.add(`-${normalizeForCompare(s)}`));
      changes.push({ changeType: "locations_changed", url: c.url, beforeExcerpt: excerpt(locRemoved.join(", ")), afterExcerpt: excerpt(locAdded.join(", ")), detail: { added: locAdded, removed: locRemoved } });
    }

    // Identity: homepage only (footer identity repeats on every page)
    if (c.discoveredVia === "homepage") {
      const fieldsChanged: string[] = [];
      const pi = p.identity ?? { name: null, phone: null, address: null };
      const ci = c.identity ?? { name: null, phone: null, address: null };
      if (!same(pi.name, ci.name)) fieldsChanged.push("name");
      if (digits(pi.phone) !== digits(ci.phone)) fieldsChanged.push("phone");
      if (!same(pi.address, ci.address)) fieldsChanged.push("address");
      if (fieldsChanged.length) {
        const fmt = (i: typeof pi) => fieldsChanged.map((f) => `${f}: ${i[f as keyof typeof pi] ?? "not found"}`).join(" · ");
        changes.push({ changeType: "identity_changed", url: c.url, beforeExcerpt: excerpt(fmt(pi)), afterExcerpt: excerpt(fmt(ci)), detail: { fields: fieldsChanged, before: pi, after: ci } });
      }
    }

    const sim = contentSimilarity(p.contentBlocks, c.contentBlocks);
    if (sim.similarity < MATERIAL_SIMILARITY && sim.changedChars >= MATERIAL_MIN_CHARS) {
      changes.push({
        changeType: "content_changed",
        url: c.url,
        beforeExcerpt: excerpt(sim.removed[0] ?? null),
        afterExcerpt: excerpt(sim.added[0] ?? null),
        detail: { similarity: Math.round(sim.similarity * 1000) / 1000, changedChars: sim.changedChars, blocksAdded: sim.added.length, blocksRemoved: sim.removed.length },
      });
    }
  }
  return { kind: "compared", changes, uncheckable };
}
