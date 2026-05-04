import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdminReportCard } from "@/components/AdminReportCard";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { getDbFingerprint } from "@/lib/db-fingerprint";

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

  // ---- Debug DB diagnostics (no credentials ever rendered) ----
  const fp = getDbFingerprint();
  const totalCount = await prisma.auditOrder.count();
  const grouped = await prisma.auditOrder.groupBy({
    by: ["reportStatus"],
    _count: { _all: true },
  });
  const statusCounts: Record<string, number> = {
    pending: 0,
    queued: 0,
    running: 0,
    generated: 0,
    failed: 0,
  };
  for (const row of grouped) {
    statusCounts[row.reportStatus] =
      (statusCounts[row.reportStatus] ?? 0) + row._count._all;
  }
  const sentCount = await prisma.auditOrder.count({
    where: { reportSentToCustomerAt: { not: null } },
  });
  const latestFive = await prisma.auditOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      businessName: true,
      websiteUrl: true,
      paymentStatus: true,
      reportStatus: true,
      createdAt: true,
    },
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

        <details className="mt-6 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55 hover:text-white">
            Debug DB
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <dl className="space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Host</dt>
                <dd className="text-white/85">
                  {fp ? `${fp.host}${fp.port ? `:${fp.port}` : ""}` : "(unset)"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Database</dt>
                <dd className="text-white/85">{fp?.database ?? "(unknown)"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Fingerprint</dt>
                <dd className="text-white/85 break-all">
                  {fp?.fingerprint ?? "(n/a)"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">Total orders</dt>
                <dd className="text-white/85">{totalCount}</dd>
              </div>
            </dl>
            <dl className="space-y-1.5 font-mono text-[11px]">
              {(
                [
                  "pending",
                  "queued",
                  "running",
                  "generated",
                  "failed",
                ] as const
              ).map((s) => (
                <div key={s} className="flex justify-between gap-3">
                  <dt className="text-white/45">reportStatus = {s}</dt>
                  <dd className="text-white/85">{statusCounts[s] ?? 0}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <dt className="text-white/45">sent (customer)</dt>
                <dd className="text-white/85">{sentCount}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Latest 5 orders
            </p>
            <ul className="mt-2 space-y-1 font-mono text-[11px]">
              {latestFive.map((o) => (
                <li
                  key={o.id}
                  className="rounded border border-white/[0.06] bg-black/20 px-2 py-1.5"
                >
                  <span className="text-white/45">id=</span>
                  <span className="text-white/85">{o.id}</span>
                  <span className="text-white/45"> · pay=</span>
                  <span className="text-white/85">{o.paymentStatus}</span>
                  <span className="text-white/45"> · report=</span>
                  <span className="text-white/85">{o.reportStatus}</span>
                  <span className="text-white/45"> · biz=</span>
                  <span className="text-white/85">
                    "{o.businessName ?? "(no name)"}"
                  </span>
                  <div className="mt-0.5 text-white/55">
                    <span className="text-white/45">url=</span>
                    {o.websiteUrl}
                    <span className="text-white/45"> · created=</span>
                    {o.createdAt.toISOString()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-white/45">
            Worker startup logs print this same fingerprint and counts.
            If the two don&apos;t match, Vercel and the worker are pointed
            at different databases. Compare against the worker&apos;s
            <code className="mx-1">[geo-worker] db host=…</code> line.
          </p>
        </details>

        {orders.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center">
            <p className="text-base font-semibold text-white">
              No paid orders yet.
            </p>
            <p className="muted mt-2 text-sm">
              Paid orders appear here as soon as Stripe confirms payment. To
              test the flow without a real charge, use the local test bypass
              on the order page in dev mode.
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
