import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdminOrderActions } from "@/components/AdminOrderActions";
import { AdminReviewForm } from "@/components/AdminReviewForm";
import { ReportViewerClient } from "@/components/ReportViewerClient";
import { prisma } from "@/lib/db";
import { isValidAdminKey } from "@/lib/admin-secret";
import { parseReportScore } from "@/lib/parse-report-score";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Order detail · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { key?: string };
}) {
  if (!isValidAdminKey(searchParams?.key)) {
    notFound();
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order) notFound();

  const key = searchParams!.key!;
  const scoreInfo = parseReportScore(order.reportMarkdown);
  const scoreTone =
    scoreInfo === null
      ? "muted"
      : scoreInfo.score >= 75
        ? "ok"
        : scoreInfo.score >= 50
          ? "warn"
          : "bad";

  return (
    <main>
      <Header />

      <section className="border-b border-white/5">
        <div className="container-page py-8">
          <Link
            href={`/admin/orders?key=${encodeURIComponent(key)}`}
            className="text-xs uppercase tracking-[0.18em] text-white/50 hover:text-accent"
          >
            ← All orders
          </Link>
          <h1 className="h2 mt-3">{order.businessName ?? order.email}</h1>
          <p className="muted mt-1 text-sm break-all">{order.websiteUrl}</p>
        </div>
      </section>

      <section className="border-b border-white/5">
        <div className="container-page py-8">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <Field label="Customer email" value={order.email} />
            <Field
              label="Business name"
              value={order.businessName ?? "(not provided)"}
            />
            <Field label="Website" value={order.websiteUrl} link />
            <Field
              label="Competitor"
              value={order.competitorUrl ?? "(none)"}
              link={Boolean(order.competitorUrl)}
            />
            <Field
              label="Payment status"
              value={order.paymentStatus}
              tone={order.paymentStatus === "paid" ? "ok" : "warn"}
            />
            <Field
              label="Report status"
              value={order.reportStatus}
              tone={
                order.reportStatus === "generated"
                  ? "ok"
                  : order.reportStatus === "failed"
                    ? "err"
                    : "warn"
              }
            />
            <Field
              label="Amount paid"
              value={`$${(order.amount / 100).toFixed(2)} ${order.currency.toUpperCase()}`}
            />
            <Field
              label="Stripe session"
              value={order.stripeSessionId}
              mono
            />
            <Field
              label="Created"
              value={new Date(order.createdAt).toLocaleString()}
            />
            <Field
              label="Report generated"
              value={
                order.reportGeneratedAt
                  ? new Date(order.reportGeneratedAt).toLocaleString()
                  : "—"
              }
            />
            <Field
              label="Report sent to customer"
              value={
                order.reportSentToCustomerAt
                  ? new Date(order.reportSentToCustomerAt).toLocaleString()
                  : "—"
              }
              tone={order.reportSentToCustomerAt ? "ok" : undefined}
            />
            <Field
              label="Admin notified"
              value={
                order.adminEmailSentAt
                  ? new Date(order.adminEmailSentAt).toLocaleString()
                  : "—"
              }
            />
          </dl>
        </div>
      </section>

      <section className="border-b border-white/5">
        <div className="container-page py-8">
          <p className="section-eyebrow">Actions</p>
          <h2 className="h3 mt-2">Run audit · Send report</h2>
          <p className="muted mt-2 text-sm">
            "Run GEO Audit" enqueues the job; the geo-worker process picks
            it up out-of-band and writes the markdown back to the database.
            "Send Report Email" delivers the generated markdown to{" "}
            <code className="text-white/85">{order.email}</code> via Resend.
            Both actions have duplicate protection — pass force to override.
          </p>
          <div className="mt-5">
            <AdminOrderActions
              orderId={order.id}
              adminKey={key}
              reportStatus={order.reportStatus}
              reportSentToCustomerAt={
                order.reportSentToCustomerAt
                  ? order.reportSentToCustomerAt.toISOString()
                  : null
              }
            />
          </div>
        </div>
      </section>

      {order.reportError ? (
        <section className="border-b border-white/5">
          <div className="container-page py-8">
            <p className="section-eyebrow text-red-300">Last audit error</p>
            <pre className="mt-3 max-h-[300px] overflow-auto rounded-xl border border-red-400/30 bg-red-500/[0.04] p-5 text-xs leading-relaxed text-red-200">
{order.reportError}
            </pre>
          </div>
        </section>
      ) : null}

      <section className="border-b border-white/5">
        <div className="container-page py-8">
          <p className="section-eyebrow">QA review</p>
          <h2 className="h3 mt-2">Approve before sending.</h2>
          <p className="muted mt-2 text-sm">
            Mark this report reviewed once you've spot-checked the audit, fixed
            any obvious data issues, and the deliverable is sale-ready. Notes
            stay internal — they aren't included in the customer email.
          </p>
          <div className="mt-5">
            <AdminReviewForm
              orderId={order.id}
              adminKey={key}
              initialReviewStatus={order.reviewStatus}
              initialAdminNotes={order.adminNotes ?? ""}
              initialQualityScore={order.qualityScore}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="container-page py-8">
          <p className="section-eyebrow">Generated report</p>
          {order.reportMarkdown ? (
            <>
              {scoreInfo ? (
                <div className="mt-5 grid gap-4 rounded-xl border border-white/10 bg-ink-900/60 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
                  <div
                    className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-2 ${
                      scoreTone === "ok"
                        ? "border-emerald-300/40 bg-emerald-300/[0.08]"
                        : scoreTone === "warn"
                          ? "border-amber-300/40 bg-amber-300/[0.08]"
                          : scoreTone === "bad"
                            ? "border-accent/40 bg-accent/[0.08]"
                            : "border-white/15 bg-white/[0.03]"
                    }`}
                  >
                    <div
                      className={`text-3xl font-bold leading-none ${
                        scoreTone === "ok"
                          ? "text-emerald-300"
                          : scoreTone === "warn"
                            ? "text-amber-300"
                            : scoreTone === "bad"
                              ? "text-accent"
                              : "text-white"
                      }`}
                    >
                      {scoreInfo.score}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">
                      / 100
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-white leading-tight">
                      {order.businessName ?? order.email}
                    </h2>
                    {scoreInfo.status ? (
                      <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                        {scoreInfo.status}
                      </p>
                    ) : null}
                    <p className="muted mt-2 text-sm break-all">
                      {order.websiteUrl}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-8 rounded-xl border border-white/10 bg-ink-900/60 p-6 md:p-8">
                <ReportViewerClient markdown={order.reportMarkdown} />
              </div>
            </>
          ) : (
            <p className="muted mt-3 text-sm">
              No report yet. Click "Run GEO Audit" above to generate one.
            </p>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Field({
  label,
  value,
  tone,
  link,
  mono,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "err";
  link?: boolean;
  mono?: boolean;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-200"
        : tone === "err"
          ? "text-red-300"
          : "text-white";
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
        {label}
      </dt>
      <dd
        className={`mt-1 ${mono ? "font-mono text-xs" : ""} ${toneClass} break-all`}
      >
        {link && value && value !== "—" && value !== "(none)" ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-accent"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
