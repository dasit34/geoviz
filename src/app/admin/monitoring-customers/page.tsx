import { notFound } from "next/navigation";

import { isAdminPageRequest } from "@/lib/admin-secret";
import { prisma } from "@/lib/db";
import { monitoringAccess } from "@/lib/monitoring/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monitoring customers · Admin", robots: { index: false, follow: false } };

const fmt = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 16) + "Z" : "—");

/**
 * Operator view of monitoring accounts: who owns which subscription, last
 * sign-in, and the "Send sign-in link" / "Sign out everywhere" actions.
 * Sign-in email changes are admin-assisted during Early Access (database
 * edit of MonitoringCustomer.email by an operator; not offered here).
 */
export default async function MonitoringCustomersAdminPage({
  searchParams,
}: {
  searchParams?: { key?: string | string[]; notice?: string };
}) {
  if (!isAdminPageRequest({ key: searchParams?.key })) notFound();
  const key = typeof searchParams?.key === "string" ? searchParams.key : "";

  const subs = await prisma.monitoringSubscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, businessName: true, websiteUrl: true, email: true, status: true, cancelAtPeriodEnd: true,
      currentPeriodEnd: true, priorStripeSubscriptionIds: true, createdAt: true,
      customer: {
        select: {
          id: true, email: true, lastSignInAt: true,
          _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
        },
      },
    },
  });
  const now = new Date();
  const notice = typeof searchParams?.notice === "string" ? searchParams.notice.slice(0, 200) : null;

  return (
    <main className="container-page py-12">
      <h1 className="h2">Monitoring customers</h1>
      <p className="muted mt-2 text-sm">
        Customers sign in with single-use emailed links. &quot;Send sign-in link&quot; emails the account owner directly — the link
        is never shown here.
      </p>
      {notice ? <p role="status" className="mt-4 text-sm text-severity-info">{notice}</p> : null}
      <table className="mt-8 w-full text-left text-sm">
        <thead className="text-xs text-white/50">
          <tr>
            <th className="py-2">Business</th><th>Account email</th><th>Status</th><th>Last sign-in</th><th>Sessions</th><th>Reactivations</th><th />
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id} className="border-t border-white/10 align-top">
              <td className="py-2">
                <p className="text-white">{s.businessName || s.websiteUrl}</p>
                <p className="mono-data text-xs text-white/45">{s.id}</p>
              </td>
              <td className="mono-data text-xs">{s.customer?.email ?? `${s.email} (not linked yet)`}</td>
              <td className="text-xs">{monitoringAccess(s, now).label}</td>
              <td className="mono-data text-xs">{fmt(s.customer?.lastSignInAt)}</td>
              <td className="mono-data text-xs">{s.customer?._count.sessions ?? 0}</td>
              <td className="mono-data text-xs">{s.priorStripeSubscriptionIds.length}</td>
              <td className="space-y-1 py-2">
                <form action="/api/admin/monitoring-customers" method="POST">
                  <input type="hidden" name="key" value={key} />
                  <input type="hidden" name="subscriptionId" value={s.id} />
                  <input type="hidden" name="action" value="send_sign_in_link" />
                  <button type="submit" className="btn-ghost px-2 py-1 text-xs">Send sign-in link</button>
                </form>
                {s.customer ? (
                  <form action="/api/admin/monitoring-customers" method="POST">
                    <input type="hidden" name="key" value={key} />
                    <input type="hidden" name="subscriptionId" value={s.id} />
                    <input type="hidden" name="action" value="revoke_sessions" />
                    <button type="submit" className="btn-ghost px-2 py-1 text-xs">Sign out everywhere</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
