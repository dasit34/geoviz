import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isValidAdminKey } from "@/lib/admin-secret";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin Orders · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: { key?: string };
}) {
  if (!isValidAdminKey(searchParams?.key)) {
    notFound();
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
        <p className="pill">Admin · Audit fulfillment</p>
        <h1 className="h2 mt-3">Paid orders</h1>
        <p className="muted mt-2 text-sm">
          {orders.length} paid order{orders.length === 1 ? "" : "s"} · Click a
          row to open the detail view, run the GEO audit, and send the report.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-ink-900/60">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.18em] text-white/50">
              <tr>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Website</th>
                <th className="px-5 py-3">Competitor</th>
                <th className="px-5 py-3">Payment</th>
                <th className="px-5 py-3">Report</th>
                <th className="px-5 py-3">Review</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-white/50"
                  >
                    No paid orders yet.
                  </td>
                </tr>
              ) : null}
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-white/5 align-top">
                  <td className="px-5 py-4 text-white/70 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-white/85">
                    <div>{o.email}</div>
                    {o.businessName ? (
                      <div className="text-xs text-white/50">
                        {o.businessName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={o.websiteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-white hover:text-accent break-all"
                    >
                      {o.websiteUrl}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-white/70 break-all">
                    {o.competitorUrl ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    <PaymentPill value={o.paymentStatus} />
                  </td>
                  <td className="px-5 py-4">
                    <ReportPill value={o.reportStatus} />
                    {o.reportSentToCustomerAt ? (
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                        sent {new Date(o.reportSentToCustomerAt).toLocaleDateString()}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <ReviewPill value={o.reviewStatus} />
                    {typeof o.qualityScore === "number" ? (
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
                        QA {o.qualityScore}/10
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/orders/${o.id}?key=${encodeURIComponent(key)}`}
                      className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent/60"
                    >
                      {o.reportStatus === "generated" ? "View Report" : "Run GEO Audit"} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function PaymentPill({ value }: { value: string }) {
  const tone =
    value === "paid"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
      : value === "failed"
        ? "border-red-400/30 bg-red-400/10 text-red-200"
        : "border-amber-300/30 bg-amber-300/10 text-amber-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${tone}`}
    >
      {value}
    </span>
  );
}

function ReportPill({ value }: { value: string }) {
  const tone: Record<string, string> = {
    pending: "border-white/15 bg-white/[0.04] text-white/60",
    running: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    generated: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    failed: "border-red-400/30 bg-red-400/10 text-red-200",
  };
  const cls = tone[value] ?? tone.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${cls}`}
    >
      {value}
    </span>
  );
}

function ReviewPill({ value }: { value: string }) {
  const tone: Record<string, string> = {
    pending: "border-white/15 bg-white/[0.04] text-white/60",
    needs_changes: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    approved: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  };
  const cls = tone[value] ?? tone.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${cls}`}
    >
      {value.replace("_", " ")}
    </span>
  );
}
