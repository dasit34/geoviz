import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdminReportCard } from "@/components/AdminReportCard";
import { prisma, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Reports · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: { key?: string | string[] };
}) {
  // Read process.env at request time. No fallback, no module-level cache,
  // no helper — the env value must come from the running Vercel function.
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  const rawKey = searchParams?.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  // Fail closed when ADMIN_SECRET isn't set (otherwise undefined === undefined
  // would let an unauth'd request through). The actual compare is the strict
  // !== required by the spec.
  if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
    return (
      <UnauthorizedPage
        configured={Boolean(ADMIN_SECRET)}
        expectedLength={ADMIN_SECRET ? ADMIN_SECRET.length : 0}
        receivedLength={key ? key.length : 0}
      />
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

function diagnoseReason(args: {
  configured: boolean;
  expectedLength: number;
  receivedLength: number;
}): string {
  if (!args.configured) {
    return "Server is missing ADMIN_SECRET. Set it in Vercel → Project → Settings → Environment Variables and redeploy.";
  }
  if (args.receivedLength === 0) {
    return "No `?key=` query parameter on the request URL.";
  }
  if (args.expectedLength !== args.receivedLength) {
    return "Length differs from the server secret — likely a copy/paste slip, missing URL-encoding, or stray whitespace.";
  }
  return "Lengths match but the keys differ. Re-check the value in your Vercel environment variables.";
}

function UnauthorizedPage({
  configured,
  expectedLength,
  receivedLength,
}: {
  configured: boolean;
  expectedLength: number;
  receivedLength: number;
}) {
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
            Append a valid <code>?key=</code> query parameter that matches the
            <code> ADMIN_SECRET</code> environment variable.
          </p>

          <dl className="mt-6 grid gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-left text-xs">
            <Row
              label="ADMIN_SECRET exists"
              value={configured ? "true" : "false"}
              tone={configured ? "ok" : "err"}
            />
            <Row
              label="Expected length"
              value={configured ? String(expectedLength) : "not set"}
            />
            <Row
              label="Received length"
              value={
                receivedLength > 0
                  ? String(receivedLength)
                  : "none provided"
              }
            />
          </dl>
          <p className="mt-4 text-left text-xs leading-relaxed text-amber-200">
            <span className="font-semibold">Reason:</span>{" "}
            {diagnoseReason({ configured, expectedLength, receivedLength })}
          </p>
          <p className="mt-4 text-[10px] leading-relaxed text-white/40">
            Diagnostics are length-only and never echo either secret.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "err";
}) {
  const valueClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "err"
        ? "text-red-300"
        : "text-white/85";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-white/50">{label}</dt>
      <dd className={`font-mono text-[11px] ${valueClass}`}>{value}</dd>
    </div>
  );
}
