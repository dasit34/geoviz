import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isAuthed, getAdminPassword } from "@/lib/admin-auth";
import { loginAction } from "@/app/admin/actions";
import {
  parseAiValidations,
  parseConsensusIndex,
  ProviderTelemetryGrid,
  type ParsedValidations,
  type ParsedConsensus,
} from "@/components/admin/ProviderTelemetryGrid";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Order detail · Admin · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Admin order-detail view at `/admin/orders/[id]`.
 *
 * Surfaces the per-audit validator execution panel + consensus
 * summary side-by-side with the order's basic shell (status, email,
 * runtime, model used). This is the operator-facing "what happened
 * with the AI validators on this audit?" view.
 *
 * For the deeper diagnostics drawer (raw JSON, deterministic score
 * breakdown, replay bundle, preflight signals, score provenance) see
 * `/admin/trace/[id]` — a sibling route that is intentionally
 * separate so the trace surface stays a clearly internal-only view.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isAuthed()) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <div className="mx-auto max-w-md">
            <p className="pill">Admin · Order detail</p>
            <h1 className="h2 mt-3">Sign in</h1>
            <p className="muted mt-3 text-sm">
              Enter the admin password to view order details.
            </p>
            {!getAdminPassword() ? (
              <div className="mt-6 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                <code>ADMIN_PASSWORD</code> is not set. Configure it in
                your environment to enable admin access.
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
              <button
                type="submit"
                className="btn-primary w-full justify-center"
              >
                Sign in
              </button>
            </form>
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

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    include: {
      intelligence: {
        select: {
          aiValidations: true,
          consensusIndex: true,
        },
      },
    },
  });

  if (!order) notFound();

  const validations: ParsedValidations = parseAiValidations(
    order.intelligence?.aiValidations ?? null,
  );
  const consensus: ParsedConsensus = parseConsensusIndex(
    order.intelligence?.consensusIndex ?? null,
  );

  return (
    <main>
      <Header />
      <section className="container-page py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="pill">Admin · Order detail</p>
            <h1 className="h2 mt-2">Order</h1>
            <p className="muted mt-2 text-sm">
              Per-audit validator execution + cross-model consensus. For
              the full internal trace (raw JSON, deterministic score
              breakdown, preflight signals), open the trace view.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin"
              className="btn-ghost text-sm"
            >
              Back to queue
            </Link>
            <Link
              href={`/admin/trace/${order.id}`}
              className="btn-primary text-sm"
            >
              Open trace
            </Link>
          </div>
        </div>

        <div className="mt-8 card">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Order ID" value={order.id} mono />
            <Field
              label="Created"
              value={new Date(order.createdAt).toISOString()}
              mono
            />
            <Field label="Email" value={order.email} />
            <Field label="Website" value={order.websiteUrl} link />
            <Field label="Payment" value={order.paymentStatus} />
            <Field label="Audit" value={order.auditStatus} />
            <Field label="Report status" value={order.reportStatus} mono />
            <Field
              label="Worker runtime"
              value={
                order.workerRuntimeMs
                  ? `${order.workerRuntimeMs} ms`
                  : "—"
              }
              mono
            />
            <Field label="Audit model" value={order.modelUsed ?? "—"} mono />
            <Field
              label="Tokens"
              value={
                order.inputTokens != null && order.outputTokens != null
                  ? `${order.inputTokens} → ${order.outputTokens}`
                  : "—"
              }
              mono
            />
            <Field
              label="Cost (est.)"
              value={
                order.estimatedCostUsd != null
                  ? `$${order.estimatedCostUsd.toString()}`
                  : "—"
              }
              mono
            />
            <Field
              label="Report generated"
              value={
                order.reportGeneratedAt
                  ? new Date(order.reportGeneratedAt).toISOString()
                  : "—"
              }
              mono
            />
          </div>
        </div>

        <div className="mt-10">
          <h2 className="h3">Validator execution</h2>
          <p className="muted mt-2 text-sm">
            Per-provider status, timestamp, and failure reason where
            captured. On null,{" "}
            <code className="mono-data text-white/80">aiValidations</code>{" "}
            renders every provider as &quot;Not run&quot; — never
            fabricated participation.
          </p>
          <div className="mt-4">
            <ProviderTelemetryGrid validations={validations} />
          </div>
        </div>

        <div className="mt-10">
          <h2 className="h3">Cross-model consensus</h2>
          {consensus ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Verdict" value={consensus.verdict ?? "—"} />
              <Field
                label="Confidence index"
                value={
                  consensus.confidence_index != null
                    ? String(consensus.confidence_index)
                    : "—"
                }
                mono
              />
              <Field
                label="Confidence band"
                value={consensus.confidence_band ?? "—"}
              />
              <Field
                label="Model agreement"
                value={consensus.model_agreement ?? "—"}
              />
              <Field
                label="Providers passed"
                value={String(
                  consensus.agreement_metrics?.providers_passed ?? 0,
                )}
                mono
              />
              <Field
                label="Providers failed"
                value={String(
                  consensus.agreement_metrics?.providers_failed ?? 0,
                )}
                mono
              />
              <Field
                label="Providers unavailable"
                value={String(
                  consensus.agreement_metrics?.providers_unavailable ?? 0,
                )}
                mono
              />
              <Field
                label="Score stdev"
                value={
                  consensus.agreement_metrics?.business_understanding_stdev !=
                  null
                    ? consensus.agreement_metrics.business_understanding_stdev.toFixed(
                        2,
                      )
                    : "—"
                }
                mono
              />
            </div>
          ) : (
            <div className="mt-4 card">
              <p className="muted text-sm">
                Consensus not computed for this audit (consensus pipeline
                gate was off, or fewer than two validators passed).
              </p>
            </div>
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
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      {link ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          className={`mt-1 block text-sm text-white hover:text-accent ${mono ? "mono-data" : ""}`}
        >
          {value}
        </a>
      ) : (
        <p
          className={`mt-1 text-sm text-white/85 ${mono ? "mono-data" : ""}`}
        >
          {value}
        </p>
      )}
    </div>
  );
}
