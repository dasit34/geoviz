import type { BillingActions } from "@/lib/monitoring/billing-actions";
import type { MonitoringStatusView } from "@/lib/monitoring/status-view";

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";

function Hidden({ subscriptionId, action }: { subscriptionId: string; action: string }) {
  return (
    <>
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="action" value={action} />
    </>
  );
}

/**
 * Settings tab for one monitoring record: business name, sign-in email
 * (admin-assisted changes during Early Access), billing (cancel at period
 * end / keep monitoring / reactivate / Stripe portal), and sign out.
 */
export function MonitoringSettingsSection({
  subscriptionId,
  view,
  accountEmail,
  billing,
  canEdit,
}: {
  subscriptionId: string;
  view: MonitoringStatusView;
  accountEmail: string;
  billing: BillingActions;
  canEdit: boolean;
}) {
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      <section className="card p-5">
        <h2 className="h3">Business</h2>
        <form action="/api/monitoring/account" method="POST" className="mt-4">
          <Hidden subscriptionId={subscriptionId} action="update_business_name" />
          <label className="block text-xs text-white/55" htmlFor="businessName">Business name</label>
          <input
            id="businessName"
            name="businessName"
            defaultValue={view.businessName ?? ""}
            maxLength={120}
            disabled={!canEdit}
            className="input-field mt-1"
          />
          {canEdit ? <button type="submit" className="btn-ghost mt-3 px-3 py-1 text-xs">Save</button> : null}
        </form>
        <p className="mt-4 text-xs text-white/55">Website</p>
        <p className="mono-data text-sm text-white/80">{view.websiteUrl}</p>
        <p className="mt-3 text-xs text-white/45">
          To monitor a different website, contact support@geoviz.ai. Business facts used in drafts live on the Improvements tab.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="h3">Billing</h2>
        <p className="mt-3 text-sm text-white/80">{view.access.label}</p>
        {view.currentPeriodEnd ? (
          <p className="mt-1 text-xs text-white/55">
            {view.cancelAtPeriodEnd || view.access.tone === "ended" ? "Access ends" : "Current period ends"}{" "}
            {fmtDate(view.currentPeriodEnd)}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {billing.canCancel ? (
            <form action="/api/monitoring/account" method="POST">
              <Hidden subscriptionId={subscriptionId} action="cancel_at_period_end" />
              <button type="submit" className="btn-ghost px-3 py-1 text-xs">Cancel at end of billing period</button>
            </form>
          ) : null}
          {billing.canResume ? (
            <form action="/api/monitoring/account" method="POST">
              <Hidden subscriptionId={subscriptionId} action="resume" />
              <button type="submit" className="btn-primary px-3 py-1 text-xs">Keep monitoring</button>
            </form>
          ) : null}
          {billing.canReactivate ? (
            <form action="/api/monitoring/account" method="POST">
              <Hidden subscriptionId={subscriptionId} action="reactivate" />
              <button type="submit" className="btn-primary px-3 py-1 text-xs">Reactivate monitoring</button>
            </form>
          ) : null}
          {view.canManageBilling ? (
            <form action="/api/monitoring/portal" method="POST">
              <input type="hidden" name="subscriptionId" value={subscriptionId} />
              <button type="submit" className="btn-ghost px-3 py-1 text-xs">Payment method &amp; invoices</button>
            </form>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-white/45">
          Canceling keeps monitoring active until the end of the period you&apos;ve paid for. Afterwards your results, reports,
          and history stay available read-only, and you can reactivate at any time.
        </p>
      </section>

      <section className="card p-5 md:col-span-2">
        <h2 className="h3">Sign-in</h2>
        <p className="mt-3 text-sm text-white/80">
          Signed in as <span className="mono-data">{accountEmail}</span>
        </p>
        <p className="mt-1 text-xs text-white/45">
          GeoViz uses emailed sign-in links — there&apos;s no password. To change your sign-in email, contact support@geoviz.ai.
        </p>
        <form action="/api/monitoring/auth/sign-out" method="POST" className="mt-4">
          <button type="submit" className="btn-ghost px-3 py-1 text-xs">Sign out</button>
        </form>
      </section>
    </div>
  );
}
