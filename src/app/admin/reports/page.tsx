import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdminReportCard } from "@/components/AdminReportCard";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isValidAdminKey } from "@/lib/admin-secret";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reports · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: { key?: string };
}) {
  // Spec: render a clear "Unauthorized" page instead of 404 when the
  // secret is missing or wrong. Helps the operator distinguish a bad
  // key from a missing route.
  if (!isValidAdminKey(searchParams?.key)) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <div className="mx-auto max-w-md rounded-xl border border-red-400/30 bg-red-500/[0.06] p-8 text-center">
            <p className="pill border-red-400/30 bg-red-400/10 text-red-200">
              401
            </p>
            <h1 className="h2 mt-4">Unauthorized</h1>
            <p className="muted mt-3 text-sm">
              Append a valid <code>?key=</code> query parameter that matches
              the <code>ADMIN_SECRET</code> environment variable.
            </p>
          </div>
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

  const orders = await prisma.auditOrder.findMany({
    where: { paymentStatus: "paid" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const key = searchParams!.key!;

  return (
    <main>
      <Header />
      <section className="container-page py-12">
        <p className="pill">Admin · Reports dashboard</p>
        <h1 className="h2 mt-3">Run, review, send.</h1>
        <p className="muted mt-2 text-sm max-w-2xl">
          Every paid order in one place. Run the GEO audit, expand the report
          to review it inline, mark it approved, then send it to the customer
          via email — all without leaving this page.
        </p>

        {orders.length === 0 ? (
          <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="muted text-sm">
              No paid orders yet. They&apos;ll appear here as soon as Stripe
              confirms payment.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-6">
            {orders.map((o) => (
              <AdminReportCard
                key={o.id}
                adminKey={key}
                order={{
                  id: o.id,
                  email: o.email,
                  businessName: o.businessName,
                  websiteUrl: o.websiteUrl,
                  competitorUrl: o.competitorUrl,
                  paymentStatus: o.paymentStatus,
                  reportStatus: o.reportStatus,
                  reportMarkdown: o.reportMarkdown,
                  reportError: o.reportError,
                  reportGeneratedAt: o.reportGeneratedAt
                    ? o.reportGeneratedAt.toISOString()
                    : null,
                  reportSentToCustomerAt: o.reportSentToCustomerAt
                    ? o.reportSentToCustomerAt.toISOString()
                    : null,
                  reviewStatus: o.reviewStatus,
                  adminNotes: o.adminNotes,
                  qualityScore: o.qualityScore,
                  amount: o.amount,
                  currency: o.currency,
                  createdAt: o.createdAt.toISOString(),
                }}
              />
            ))}
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
