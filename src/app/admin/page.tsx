import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isAuthed, getAdminPassword } from "@/lib/admin-auth";
import {
  loginAction,
  logoutAction,
  markCompletedAction,
  markPendingAction,
  updateNotesAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin · GeoViz",
  robots: { index: false, follow: false },
};

type Order = {
  id: string;
  websiteUrl: string;
  email: string;
  businessName: string | null;
  paymentStatus: string;
  auditStatus: string;
  notes: string | null;
  amount: number;
  createdAt: Date;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  if (!isAuthed()) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <div className="mx-auto max-w-md">
            <p className="pill">Admin</p>
            <h1 className="h2 mt-3">Sign in</h1>
            <p className="muted mt-3 text-sm">
              Enter the admin password to view orders.
            </p>

            {!getAdminPassword() ? (
              <div className="mt-6 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                <code>ADMIN_PASSWORD</code> is not set. Configure it in your
                environment to enable the admin page.
              </div>
            ) : null}

            {searchParams?.error === "invalid" ? (
              <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                Incorrect password.
              </div>
            ) : null}

            <form action={loginAction} className="card mt-6 space-y-4">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-white/85"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="input-field"
              />
              <button type="submit" className="btn-primary w-full justify-center">
                Sign in
              </button>
            </form>
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  let orders: Order[] = [];
  let dbError: string | null = null;

  if (!isDatabaseConfigured()) {
    dbError =
      "DATABASE_URL is not set. Configure your Postgres connection string and run `npx prisma db push` to enable order storage.";
  } else {
    try {
      orders = await prisma.auditOrder.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    } catch (err) {
      console.error("[admin] DB query failed", err);
      dbError =
        "Could not connect to the database. Check DATABASE_URL and that the schema has been pushed (`npx prisma db push`).";
    }
  }

  const totals = {
    all: orders.length,
    paid: orders.filter((o) => o.paymentStatus === "paid").length,
    pendingAudits: orders.filter(
      (o) => o.paymentStatus === "paid" && o.auditStatus === "pending",
    ).length,
    revenueCents: orders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((sum, o) => sum + o.amount, 0),
  };

  return (
    <main>
      <Header />
      <section className="container-page py-12">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="pill">Admin · Order queue</p>
            <h1 className="h2 mt-3">Orders</h1>
            <p className="muted mt-2 text-sm">
              Most recent first. Run the audit manually, then mark it complete.
            </p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost text-sm">
              Sign out
            </button>
          </form>
        </div>

        {dbError ? (
          <div
            role="alert"
            className="mt-8 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
          >
            {dbError}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Total orders" value={String(totals.all)} />
          <Stat label="Paid" value={String(totals.paid)} />
          <Stat
            label="Pending audits"
            value={String(totals.pendingAudits)}
            tone="warn"
          />
          <Stat
            label="Revenue (paid)"
            value={`$${(totals.revenueCents / 100).toFixed(2)}`}
            tone="ok"
          />
        </div>

        <div className="mt-10 overflow-hidden rounded-lg border border-white/10 bg-ink-900/60">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.18em] text-white/50">
              <tr>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Website</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Payment</th>
                <th className="px-5 py-3">Audit</th>
                <th className="px-5 py-3">Notes</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-white/50"
                  >
                    {dbError ? "Database not available." : "No orders yet."}
                  </td>
                </tr>
              ) : null}
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-white/5 align-top">
                  <td className="px-5 py-4 text-white/70 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={o.websiteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-white hover:text-accent"
                    >
                      {o.websiteUrl}
                    </a>
                    {o.businessName ? (
                      <div className="text-xs text-white/40">
                        {o.businessName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-white/80">{o.email}</td>
                  <td className="px-5 py-4">
                    <PaymentPill value={o.paymentStatus} />
                  </td>
                  <td className="px-5 py-4">
                    <AuditPill value={o.auditStatus} />
                  </td>
                  <td className="px-5 py-4 min-w-[16rem]">
                    <form
                      action={updateNotesAction}
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="id" value={o.id} />
                      <textarea
                        name="notes"
                        defaultValue={o.notes ?? ""}
                        rows={2}
                        placeholder="Internal notes…"
                        className="input-field text-xs"
                      />
                      <button
                        type="submit"
                        className="self-end rounded-md border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/80 hover:border-white/25"
                      >
                        Save notes
                      </button>
                    </form>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col items-end gap-2">
                      {o.auditStatus === "pending" ? (
                        <form action={markCompletedAction}>
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/25"
                          >
                            Mark completed
                          </button>
                        </form>
                      ) : (
                        <form action={markPendingAction}>
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70 hover:border-white/25"
                          >
                            Reopen
                          </button>
                        </form>
                      )}
                    </div>
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const valueColor =
    tone === "warn"
      ? "text-accent"
      : tone === "ok"
        ? "text-emerald-300"
        : "text-white";
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
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
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}

function AuditPill({ value }: { value: string }) {
  const tone =
    value === "completed"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
      : "border-accent/30 bg-accent/10 text-accent";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}
