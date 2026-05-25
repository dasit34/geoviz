import Link from "next/link";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isValidAdminKey } from "@/lib/admin-secret";
import {
  InternalShell,
  InternalUnauthorized,
} from "@/components/internal/InternalShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Internal · GeoViz",
  robots: { index: false, follow: false },
};

type StatusCount = { reportStatus: string; count: number };

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().replace("T", " ").slice(0, 16);
}

function statusTone(status: string): string {
  if (status === "failed") return "bg-severity-critical/15 text-severity-critical";
  if (status === "queued" || status === "in_flight" || status === "running")
    return "bg-accent/15 text-accent";
  if (status === "generated" || status === "sent")
    return "bg-emerald-500/15 text-emerald-300";
  return "bg-white/5 text-white/70";
}

export default async function InternalDashboardPage({
  searchParams,
}: {
  searchParams?: { key?: string | string[] };
}) {
  const rawKey = searchParams?.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!isValidAdminKey(key)) {
    return <InternalUnauthorized />;
  }
  const adminKey = key as string;
  const k = encodeURIComponent(adminKey);

  if (!isDatabaseConfigured()) {
    return (
      <InternalShell adminKey={adminKey}>
        <section className="container-page py-12">
          <p className="muted">DATABASE_URL not configured.</p>
        </section>
      </InternalShell>
    );
  }

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const [statusGroups, todayGenerated, customerOrders, calRows] =
    await Promise.all([
      prisma.auditOrder.groupBy({
        by: ["reportStatus"],
        _count: { _all: true },
      }),
      prisma.auditOrder.count({
        where: { reportGeneratedAt: { gte: startOfDayUtc } },
      }),
      prisma.auditOrder.findMany({
        where: {
          OR: [
            { businessName: null },
            { businessName: { not: { startsWith: "[CAL]" } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          websiteUrl: true,
          email: true,
          businessName: true,
          paymentStatus: true,
          reportStatus: true,
          createdAt: true,
          reportGeneratedAt: true,
        },
      }),
      prisma.auditOrder.findMany({
        where: { businessName: { startsWith: "[CAL]" } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          websiteUrl: true,
          businessName: true,
          reportStatus: true,
          createdAt: true,
          reportGeneratedAt: true,
        },
      }),
    ]);

  const counts: Record<string, number> = {};
  for (const g of statusGroups as StatusCount[] | Array<{ reportStatus: string; _count: { _all: number } }>) {
    const row = g as { reportStatus: string; _count?: { _all: number }; count?: number };
    const n = row._count?._all ?? row.count ?? 0;
    counts[row.reportStatus] = n;
  }

  const kpi: Array<{ label: string; value: number; tone: string }> = [
    { label: "Queued", value: counts["queued"] ?? 0, tone: "text-accent" },
    {
      label: "In flight",
      value: (counts["in_flight"] ?? 0) + (counts["running"] ?? 0),
      tone: "text-accent",
    },
    { label: "Generated today", value: todayGenerated, tone: "text-emerald-300" },
    {
      label: "Failed",
      value: counts["failed"] ?? 0,
      tone: "text-severity-critical",
    },
  ];

  return (
    <InternalShell adminKey={adminKey}>
    <section className="container-page py-10">
      <header className="mb-8">
        <p className="section-eyebrow">Operator console · Dashboard</p>
        <h1 className="h2 mt-3">Internal overview</h1>
        <p className="muted mt-3 max-w-2xl">
          Read-only snapshot of the audit queue and recent activity. Mutations
          live under Run / Bulk, Reports, and Calibration. Same worker, same
          AuditOrder table, same scoring rubric customers hit.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi.map((k2) => (
          <div key={k2.label} className="card p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">
              {k2.label}
            </p>
            <p className={`mono-data mt-2 text-3xl font-semibold ${k2.tone}`}>
              {k2.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h3">Recent customer orders</h2>
            <Link
              href={`/admin/reports?key=${k}`}
              className="text-sm text-accent hover:underline"
            >
              Open reports →
            </Link>
          </div>
          {customerOrders.length === 0 ? (
            <p className="muted">No customer orders yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {customerOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-start gap-3 py-3 text-sm"
                >
                  <span
                    className={`pill mt-0.5 ${statusTone(o.reportStatus)}`}
                  >
                    {o.reportStatus}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{o.websiteUrl}</p>
                    <p className="truncate text-xs text-white/50">
                      {o.email} · {fmtDate(o.createdAt)}
                    </p>
                  </div>
                  <span className="pill bg-white/5 text-white/60">
                    {o.paymentStatus}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h3">Recent calibration / test audits</h2>
            <Link
              href={`/admin/calibration?key=${k}`}
              className="text-sm text-accent hover:underline"
            >
              Open calibration →
            </Link>
          </div>
          {calRows.length === 0 ? (
            <p className="muted">No calibration runs yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {calRows.map((o) => (
                <li
                  key={o.id}
                  className="flex items-start gap-3 py-3 text-sm"
                >
                  <span
                    className={`pill mt-0.5 ${statusTone(o.reportStatus)}`}
                  >
                    {o.reportStatus}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{o.websiteUrl}</p>
                    <p className="truncate text-xs text-white/50">
                      {o.businessName ?? "[CAL]"} · {fmtDate(o.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={`/internal/run?key=${k}`} className="btn-primary">
          Run / bulk-queue a test audit
        </Link>
        <Link href={`/admin/reports?key=${k}`} className="btn-ghost">
          Open reports console
        </Link>
        <Link href={`/admin/calibration?key=${k}`} className="btn-ghost">
          Open calibration harness
        </Link>
      </div>
    </section>
    </InternalShell>
  );
}
