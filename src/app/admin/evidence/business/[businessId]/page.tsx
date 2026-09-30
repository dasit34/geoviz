import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { AdminEvidencePanel } from "@/components/AdminEvidencePanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Business evidence · Admin · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Internal-only business-level evidence view — Intelligence Engine
 * Phase 1. Mirrors `/admin/calibration`'s `?key=` (ADMIN_SECRET) auth
 * pattern rather than the cookie mechanism, because this page embeds
 * <AdminEvidencePanel>, a client component that calls the
 * `?key=`-gated `/api/admin/evidence/stats` route — matching the
 * established pattern for pages that host a self-polling, key-gated
 * panel (see `/admin/calibration/page.tsx` + `<CalibrationDashboard>`).
 */
export default async function AdminEvidenceBusinessPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams?: { key?: string | string[] };
}) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const rawKey = searchParams?.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <h1 className="h2">Unauthorized</h1>
          <p className="muted mt-3 max-w-xl">
            This page requires an admin key. Append{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">?key=…</code>{" "}
            to the URL.
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <main>
        <Header />
        <section className="container-page py-16">
          <p className="muted">DATABASE_URL not configured.</p>
        </section>
        <Footer />
      </main>
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: {
      id: true,
      normalizedDomain: true,
      primaryWebsiteUrl: true,
      auditOrders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          businessName: true,
          websiteUrl: true,
          createdAt: true,
          reportStatus: true,
        },
      },
    },
  });
  if (!business) notFound();

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <header className="mb-8">
          <p className="section-eyebrow">Internal · Evidence layer</p>
          <h1 className="h2 mt-3">{business.primaryWebsiteUrl ?? business.normalizedDomain}</h1>
          <p className="muted mt-3 max-w-2xl">
            Aggregate AI-visibility evidence across every scan for this
            business — mention rate, recommendation rate, model
            win/loss, share of voice, and strongest competitors.
            Computed directly from persisted Observation rows; never a
            new score.
          </p>
        </header>

        <div className="mb-10">
          <AdminEvidencePanel adminKey={key!} businessId={business.id} />
        </div>

        <div className="card">
          <p className="section-eyebrow">Scans</p>
          <h3 className="h3 mt-2">{business.auditOrders.length} audit order(s)</h3>
          <ul className="mt-4 space-y-2">
            {business.auditOrders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {order.businessName ?? order.websiteUrl}
                  </p>
                  <p className="text-xs text-white/45">
                    {order.createdAt.toISOString()} · {order.reportStatus}
                  </p>
                </div>
                <a
                  href={`/admin/evidence/scan/${order.id}`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  View evidence →
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <Footer />
    </main>
  );
}
