import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { LeadsTable } from "@/components/admin/LeadsTable";
import { isAdminPageRequest, isValidAdminKey } from "@/lib/admin-secret";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Leads · Admin · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Internal (non-customer-facing) lead prospecting table. Accepts
 * either an authenticated `/admin` cookie session or a valid `?key=`
 * (see `isAdminPageRequest`, `src/lib/admin-secret.ts`) — same
 * cookie-OR-key pattern already used by `/admin/report-qa`. When the
 * operator is in via cookie only, the real `ADMIN_SECRET` value is
 * resolved server-side and handed to `<LeadsTable>` so its API calls
 * still carry a valid key automatically.
 *
 * Single bounded server fetch (take: 1000, orderBy createdAt desc) —
 * matches the existing repo convention (/admin/reports, /admin/free-
 * checks both use a bounded take with no server-side pagination);
 * search/filter/sort/pagination all happen client-side in
 * <LeadsTable /> over this fetched set, mirroring ReportQaPage's
 * filter-pill pattern. Revisit with real server pagination only if
 * lead volume actually exceeds this bound.
 */
export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams?: { key?: string | string[] };
}) {
  const rawKey = searchParams?.key;
  const rawKeyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!isAdminPageRequest({ key: rawKey })) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <h1 className="h2">Unauthorized</h1>
          <p className="muted mt-3 max-w-xl">
            Add <code className="rounded bg-white/10 px-1.5 py-0.5">?key=ADMIN_SECRET</code>{" "}
            to the URL, or sign in at{" "}
            <a href="/admin" className="text-accent hover:underline">/admin</a>.
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  const key = isValidAdminKey(rawKeyStr) && rawKeyStr
    ? rawKeyStr
    : (process.env.ADMIN_SECRET ?? "");

  const leads = await prisma.lead.findMany({
    take: 1000,
    orderBy: { createdAt: "desc" },
  });

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-eyebrow">Internal · Not customer-facing</p>
            <h1 className="h2 mt-3">Leads</h1>
            <p className="muted mt-3 max-w-2xl">
              Prospecting pipeline: discovery → qualification →
              contact enrichment → outreach tracking. Never exposed
              publicly.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/admin/leads/lists?key=${encodeURIComponent(key!)}`}
              className="btn-ghost text-sm"
            >
              Lists
            </a>
            <a
              href={`/admin/leads/import?key=${encodeURIComponent(key!)}`}
              className="btn-ghost text-sm"
            >
              Import CSV
            </a>
            <a
              href={`/admin/leads/discover?key=${encodeURIComponent(key!)}`}
              className="btn-primary text-sm"
            >
              Find New Leads
            </a>
          </div>
        </header>
        <LeadsTable adminKey={key!} initialLeads={leads} />
      </section>
      <Footer />
    </main>
  );
}
