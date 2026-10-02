import type { WebsiteChangeView, WebsiteSiteView } from "@/lib/monitoring/website/service";

/**
 * "Website Changes" tab of the monitoring dashboard (server component).
 * Shows bounded snapshots of the customer's site and confirmed competitor
 * sites. Honesty rules surfaced in copy: the first scan is a baseline, a
 * page that couldn't be checked is never "removed", and changes shown next
 * to AI-tracking runs are coincident in time — not a cause.
 */

const CHANGE_LABELS: Record<string, string> = {
  page_added: "New page",
  page_removed: "Page removed (confirmed 404/410)",
  title_changed: "Page title changed",
  description_changed: "Meta description changed",
  headings_changed: "Headings changed",
  schema_changed: "Structured data changed",
  services_changed: "Services changed",
  locations_changed: "Locations / service area changed",
  identity_changed: "Business name, phone, or address changed",
  content_changed: "Page content changed materially",
};

const FETCH_LABELS: Record<string, string> = {
  blocked_robots: "Disallowed by the site's robots.txt",
  access_denied: "Access restricted (401/403) — not bypassed",
  timeout: "Timed out",
  network_error: "Network error",
  http_error: "Server error",
  not_html: "Not a web page",
  too_large: "Page too large to capture",
  redirect_offsite: "Redirected to another site — not followed",
  blocked_unsafe: "Address not allowed",
  not_found: "Not found",
};

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "Not measured" : `${Math.round(r * 100)}%`);

function FixtureBadge() {
  return <span className="pill border-severity-warning/40 text-[10px] uppercase tracking-[0.14em] text-severity-warning">Fixture (demonstration data)</span>;
}

function siteStatus(site: WebsiteSiteView): { line: string; tone: string } {
  const l = site.latest;
  if (site.needsWebsite) return { line: "Add this competitor's website to track changes.", tone: "text-white/55" };
  if (!l) return { line: "Not scanned yet — the first scan records a baseline.", tone: "text-white/55" };
  if (l.status === "queued") {
    return { line: l.nextRetryAt ? `Couldn't scan yet; retry scheduled ${fmtDate(l.nextRetryAt)}.` : "Scan queued.", tone: "text-white/55" };
  }
  if (l.status === "failed" || l.status === "blocked") {
    return { line: `Couldn't scan on ${fmtDate(l.completedAt)}: ${l.lastError ?? l.status}. Nothing is treated as changed or removed.`, tone: "text-severity-warning" };
  }
  if (l.diffOutcome === "baseline") return { line: `Baseline recorded on ${fmtDate(l.completedAt)}.`, tone: "text-white/80" };
  if (l.diffOutcome === "baseline_rerecorded") return { line: `Baseline re-recorded on ${fmtDate(l.completedAt)} (scanner updated; not compared with older scans).`, tone: "text-white/80" };
  return { line: `Last checked ${fmtDate(l.completedAt)}.`, tone: "text-white/80" };
}

function SiteCard({ site, token, canEdit, changeCount }: { site: WebsiteSiteView; token: string; canEdit: boolean; changeCount: number }) {
  const s = siteStatus(site);
  const l = site.latest;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-[0.18em] text-white/45">{l?.isFixture ? "Demonstration site" : site.siteKind === "customer" ? "Your website" : "Competitor"}</span>
        {l?.isFixture ? <FixtureBadge /> : null}
      </div>
      <p className="mt-2 font-semibold text-white">{site.label}</p>
      {site.domain ? <p className="mono-data text-xs text-white/45">{site.domain}</p> : null}
      <p className={`mt-3 text-sm ${s.tone}`}>{s.line}</p>
      {l && (l.status === "completed" || l.status === "partial") ? (
        <p className="mt-1 text-xs text-white/50">
          {l.pagesOk} page{l.pagesOk === 1 ? "" : "s"} captured
          {site.uncheckable.length ? ` · ${site.uncheckable.length} couldn't be checked` : ""}
          {l.diffOutcome === "compared" ? ` · ${changeCount} change${changeCount === 1 ? "" : "s"} vs. previous scan` : ""}
        </p>
      ) : null}
      {site.needsWebsite && canEdit && site.competitorId ? (
        <form action="/api/monitoring/tracking" method="POST" className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="action" value="set_competitor_website" />
          <input type="hidden" name="returnTab" value="website" />
          <input type="hidden" name="id" value={site.competitorId} />
          <input name="websiteUrl" required placeholder="Their website, e.g. example.com" className="input-field" />
          <button className="btn-ghost shrink-0" type="submit">Add website</button>
        </form>
      ) : null}
    </div>
  );
}

function Excerpt({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="min-w-0 flex-1 rounded-md border border-white/[0.06] bg-ink-900/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 break-words text-sm text-white/80">{text ?? <span className="text-white/35">—</span>}</p>
    </div>
  );
}

function ChangeItem({ c }: { c: WebsiteChangeView }) {
  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-[0.18em] text-white/45">{c.isFixture ? c.siteLabel : c.siteKind === "customer" ? "Your website" : `Competitor: ${c.siteLabel}`}</span>
        {c.isFixture ? <FixtureBadge /> : null}
      </div>
      <p className="mt-2 font-semibold text-white">{CHANGE_LABELS[c.changeType] ?? c.changeType}</p>
      <a href={c.url} rel="nofollow noopener noreferrer" target="_blank" className="mono-data mt-1 block break-all text-xs text-accent underline">
        {c.url}
      </a>
      <p className="mt-1 text-xs text-white/45">Between {fmtDate(c.fromFetchedAt)} and {fmtDate(c.toFetchedAt)}</p>
      {c.beforeExcerpt || c.afterExcerpt ? (
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <Excerpt label={`Before · ${fmtDate(c.fromFetchedAt)}`} text={c.beforeExcerpt} />
          <Excerpt label={`After · ${fmtDate(c.toFetchedAt)}`} text={c.afterExcerpt} />
        </div>
      ) : null}
    </li>
  );
}

type CycleRow = { id: string; startedAt: Date; status: string; summary: { mentionRate: number | null; measured: number } | null };

function Timeline({ changes, cycles }: { changes: WebsiteChangeView[]; cycles: CycleRow[] }) {
  type Item = { at: Date; key: string; node: React.ReactNode };
  const byDay = new Map<string, { at: Date; site: string; isFixture: boolean; count: number; types: Set<string> }>();
  for (const c of changes) {
    const k = `${new Date(c.toFetchedAt).toISOString().slice(0, 10)}|${c.siteLabel}|${c.isFixture}`;
    const g = byDay.get(k) ?? { at: c.toFetchedAt, site: c.isFixture || c.siteKind !== "customer" ? c.siteLabel : "Your website", isFixture: c.isFixture, count: 0, types: new Set<string>() };
    g.count += 1;
    g.types.add(CHANGE_LABELS[c.changeType] ?? c.changeType);
    byDay.set(k, g);
  }
  const items: Item[] = [
    ...Array.from(byDay.entries()).map(([k, g]) => ({
      at: new Date(g.at),
      key: `w:${k}`,
      node: (
        <>
          <span className="text-white">{g.site}</span>: {g.count} website change{g.count === 1 ? "" : "s"} ({Array.from(g.types).slice(0, 3).join(", ")}){" "}
          {g.isFixture ? <FixtureBadge /> : null}
        </>
      ),
    })),
    ...cycles
      .filter((c) => c.summary)
      .map((c) => ({
        at: new Date(c.startedAt),
        key: `c:${c.id}`,
        node: (
          <>
            <span className="text-white">AI answer tracking run</span>: named in {pct(c.summary?.mentionRate)} of {c.summary?.measured ?? 0} measured answers
          </>
        ),
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="h3">Timeline</h3>
      <p className="mt-2 text-xs text-white/55">
        Website changes and AI answer tracking runs, by date. These happened around the same time. That alone doesn&apos;t show that
        one caused the other.
      </p>
      <ul className="mt-4 space-y-2 border-l border-white/10 pl-4">
        {items.slice(0, 30).map((i) => (
          <li key={i.key} className="text-sm text-white/70">
            <span className="mono-data mr-2 text-xs text-white/45">{fmtDate(i.at)}</span>
            {i.node}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WebsiteChangesSection({
  token,
  sites,
  changes,
  cycles,
  limits,
  canEdit,
}: {
  token: string;
  sites: WebsiteSiteView[];
  changes: WebsiteChangeView[];
  cycles: CycleRow[];
  limits: { maxPagesPerSite: number; maxCompetitorSites: number };
  canEdit: boolean;
}) {
  const countFor = (domain: string | null) => {
    const latest = changes.filter((c) => c.siteDomain === domain);
    if (latest.length === 0) return 0;
    const newest = Math.max(...latest.map((c) => new Date(c.toFetchedAt).getTime()));
    return latest.filter((c) => new Date(c.toFetchedAt).getTime() === newest).length;
  };
  const uncheckable = sites.filter((s) => s.uncheckable.length > 0);
  const yours = changes.filter((c) => !c.isFixture && c.siteKind === "customer");
  const theirs = changes.filter((c) => !c.isFixture && c.siteKind !== "customer");
  const fixture = changes.filter((c) => c.isFixture);
  return (
    <div className="mt-8 space-y-10">
      <p className="muted max-w-3xl text-sm">
        Each monitoring run captures up to {limits.maxPagesPerSite} public pages from your website and from up to {limits.maxCompetitorSites}{" "}
        competitors whose websites you&apos;ve confirmed (homepage, about, service and location pages). We respect each site&apos;s robots.txt
        and never get around access restrictions. Nothing on any website is changed.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {sites.map((s) => (
          <SiteCard key={`${s.siteKind}:${s.competitorId ?? s.domain}`} site={s} token={token} canEdit={canEdit} changeCount={countFor(s.domain)} />
        ))}
      </div>

      <div>
        <h3 className="h3">Changes on your website</h3>
        {yours.length === 0 ? (
          <p className="muted mt-2 text-sm">No changes detected yet. Changes appear after a second successful scan is compared with the baseline.</p>
        ) : (
          <ul className="mt-4 space-y-3">{yours.map((c) => <ChangeItem key={c.id} c={c} />)}</ul>
        )}
      </div>

      <div>
        <h3 className="h3">Changes on competitor websites</h3>
        {theirs.length === 0 ? (
          <p className="muted mt-2 text-sm">No competitor changes detected yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">{theirs.map((c) => <ChangeItem key={c.id} c={c} />)}</ul>
        )}
      </div>

      {fixture.length > 0 ? (
        <div>
          <h3 className="h3">Demonstration changes</h3>
          <p className="mt-2 text-xs text-white/55">
            Recorded from a fixture site served from memory, to show how changes are reported. Not real website evidence and not used in
            recommendations.
          </p>
          <ul className="mt-4 space-y-3">{fixture.map((c) => <ChangeItem key={c.id} c={c} />)}</ul>
        </div>
      ) : null}

      {uncheckable.length > 0 ? (
        <div>
          <h3 className="h3">Couldn&apos;t check</h3>
          <p className="mt-2 text-xs text-white/55">These pages couldn&apos;t be checked on the latest scan. They are not treated as removed or changed.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {uncheckable.flatMap((s) =>
              s.uncheckable.map((u) => (
                <li key={`${s.domain}:${u.url}`} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                  <span className="mono-data break-all text-xs text-white/70">{u.url}</span>
                  <span className="text-xs text-white/45">{FETCH_LABELS[u.fetchStatus] ?? u.fetchStatus}{u.httpStatus ? ` (HTTP ${u.httpStatus})` : ""}</span>
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}

      <Timeline changes={changes} cycles={cycles} />
    </div>
  );
}
