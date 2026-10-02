/**
 * Website changes → evidence-backed recommendations (pure).
 *
 * Each finding names the page, the date the change was observed, and an
 * excerpt. Findings are instructions for a person — nothing edits a
 * website and nothing sends an alert. Competitor findings are framed as
 * opportunities, never as a cause of any visibility change.
 */
import type { Recommendation } from "../tracking/recommendations";
import { normalizeForCompare } from "./extract";

export type ChangeForFindings = {
  id: string;
  siteKind: string;
  siteDomain: string;
  siteLabel: string;
  changeType: string;
  url: string;
  beforeExcerpt: string | null;
  afterExcerpt: string | null;
  detail: unknown;
  toFetchedAt: Date;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const quote = (s: string | null) => (s ? `"${s.length > 140 ? `${s.slice(0, 139)}…` : s}"` : "");
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** True when the customer's latest pages already cover a topic (case/space-insensitive substring). */
function customerCovers(topic: string, customerTopics: string[]): boolean {
  const t = normalizeForCompare(topic);
  return customerTopics.some((c) => {
    const n = normalizeForCompare(c);
    return n.includes(t) || t.includes(n);
  });
}

export function websiteFindings(input: {
  changes: ChangeForFindings[];
  /** Services/locations/headings/titles on the customer's latest successful scan. */
  customerTopics: string[];
  limit?: number;
}): Recommendation[] {
  const out: Recommendation[] = [];
  for (const c of input.changes) {
    const d = (c.detail ?? {}) as Record<string, unknown>;
    const when = day(c.toFetchedAt);
    if (c.siteKind === "customer") {
      if (c.changeType === "schema_changed" && d.localBusinessBefore === true && d.localBusinessAfter === false) {
        out.push({
          id: `website:lost_local_business_schema:${c.siteDomain}`,
          category: "structured_data",
          priority: 1,
          title: "Your website's LocalBusiness structured data is no longer present",
          action: "Restore the LocalBusiness (JSON-LD) markup with your business name, address, phone, and hours so AI systems can read your identity directly.",
          evidence: `On ${when}, ${c.url} no longer had LocalBusiness markup (before: ${c.beforeExcerpt ?? "—"}; now: ${c.afterExcerpt ?? "—"}).`,
          source: "website",
          url: c.url,
        });
      } else if (c.changeType === "page_removed") {
        out.push({
          id: `website:page_removed:${c.url}`,
          category: "website_content",
          priority: 2,
          title: "A page on your website now returns \"not found\"",
          action: "If the page was removed on purpose, redirect its address to the closest current page; if not, restore it.",
          evidence: `On ${when}, ${c.url} returned HTTP ${String(d.httpStatus ?? "404")} on a direct re-check. It previously showed ${quote(c.beforeExcerpt)}.`,
          source: "website",
          url: c.url,
        });
      } else if (c.changeType === "identity_changed") {
        const fields = strArr(d.fields);
        out.push({
          id: `website:identity_changed:${c.siteDomain}`,
          category: "business_identity",
          priority: 1,
          title: `Your website's ${fields.join(" / ") || "business details"} changed`,
          action: "Make sure your Google Business Profile, directory listings, and structured data show exactly the same name, phone, and address as your website.",
          evidence: `On ${when}, ${c.url} changed from ${quote(c.beforeExcerpt)} to ${quote(c.afterExcerpt)}.`,
          source: "website",
          url: c.url,
        });
      }
      continue;
    }
    // Competitor opportunities: a new service/location the customer doesn't cover.
    const topics =
      c.changeType === "page_added"
        ? [...strArr(d.services), ...strArr(d.locations), ...strArr(d.h1)].slice(0, 3)
        : c.changeType === "services_changed" || c.changeType === "locations_changed"
          ? strArr(d.added)
          : [];
    const uncovered = topics.filter((t) => t.length >= 4 && !customerCovers(t, input.customerTopics));
    if (uncovered.length === 0) continue;
    const topic = uncovered[0];
    out.push({
      id: `website:competitor_topic:${c.siteDomain}:${normalizeForCompare(topic)}`,
      category: "local_visibility",
      priority: 3,
      title: `${c.siteLabel} added content about ${topic}; your site doesn't have a page for it`,
      action: `If you offer ${topic}, consider a clear page that describes it, where you provide it, and common questions. This is an opportunity, not a requirement.`,
      evidence: `On ${when}, ${c.url} ${c.changeType === "page_added" ? "appeared" : "added"} ${quote(c.afterExcerpt)}. No page on your latest scan mentions it.`,
      source: "website",
      url: c.url,
    });
  }
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice(0, input.limit ?? 6);
}
