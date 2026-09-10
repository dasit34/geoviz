import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { isAdminPageRequest, isValidAdminKey } from "@/lib/admin-secret";
import { MarketStudiesPanel } from "@/components/admin/MarketStudiesPanel";
import {
  countEntryStatuses,
  scoreStats,
} from "@/lib/market-studies/studyView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Market Studies · Admin · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Market Study / Bulk Audit dashboard. Same cookie-OR-`?key=` auth as
 * `/admin/leads`. One bounded server fetch; the client panel polls the
 * API for live progress.
 */
export default async function AdminMarketStudiesPage({
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
            Add{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">
              ?key=ADMIN_SECRET
            </code>{" "}
            to the URL, or sign in at{" "}
            <a href="/admin" className="text-accent hover:underline">
              /admin
            </a>
            .
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  const key =
    isValidAdminKey(rawKeyStr) && rawKeyStr
      ? rawKeyStr
      : (process.env.ADMIN_SECRET ?? "");

  const studies = await prisma.marketStudy.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      entries: {
        select: {
          skipReason: true,
          auditOrder: {
            select: {
              reportStatus: true,
              intelligence: { select: { overallScore: true } },
            },
          },
        },
      },
    },
  });

  const rows = studies.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    city: s.city,
    state: s.state,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    counts: countEntryStatuses(s.entries),
    scoreStats: scoreStats(s.entries),
  }));

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <header className="mb-8">
          <p className="section-eyebrow">Internal · Not customer-facing</p>
          <h1 className="h2 mt-3">Market Studies</h1>
          <p className="muted mt-3 max-w-2xl">
            Bulk GeoViz audits over a set of leads. Start one from the{" "}
            <a
              href={`/admin/leads?key=${encodeURIComponent(key)}`}
              className="text-accent hover:underline"
            >
              Leads
            </a>{" "}
            page — select leads, then &ldquo;Run GeoViz Audits&rdquo;.
          </p>
        </header>
        <MarketStudiesPanel adminKey={key} initialStudies={rows} />
      </section>
      <Footer />
    </main>
  );
}
