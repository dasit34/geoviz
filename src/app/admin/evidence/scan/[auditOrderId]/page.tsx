import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isAuthed, getAdminPassword } from "@/lib/admin-auth";
import { loginAction } from "@/app/admin/actions";
import { CopyJsonButton } from "@/components/admin/CopyJsonButton";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Evidence · Admin · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Internal-only per-scan evidence drill-down — Intelligence Engine
 * Phase 1. Sibling to `/admin/trace/[id]` (same cookie-based
 * ADMIN_PASSWORD gate, same server-component-reads-Prisma-directly
 * shape). Lists every `Observation` row for this audit, grouped by
 * provider → call type, each expandable to the raw prompt/response
 * via `CopyJsonButton`. Never customer-facing.
 */
export default async function AdminEvidenceScanPage({
  params,
}: {
  params: { auditOrderId: string };
}) {
  if (!isAuthed()) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <div className="mx-auto max-w-md">
            <p className="pill">Admin · Evidence</p>
            <h1 className="h2 mt-3">Sign in</h1>
            <p className="muted mt-3 text-sm">
              Enter the admin password to view scan evidence.
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
    where: { id: params.auditOrderId },
    select: { id: true, websiteUrl: true, businessName: true, businessId: true },
  });
  if (!order) notFound();

  const observations = await prisma.observation.findMany({
    where: { auditOrderId: order.id },
    include: {
      queryLibraryEntry: {
        select: { queryText: true, industryNormalized: true, geographyRaw: true },
      },
      competitorMentions: {
        select: { competitorName: true, position: true },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ provider: "asc" }, { callType: "asc" }],
  });

  return (
    <main>
      <Header />
      <section className="container-page py-12">
        <div className="flex flex-col items-start gap-2">
          <p className="pill">Admin · Evidence</p>
          <h1 className="h2 mt-2">Scan evidence</h1>
          <p className="muted text-sm">
            Every real per-model observation captured for this audit —
            normalized from the AI validator layer, zero fabricated
            data. Never embedded in the customer report.
          </p>
        </div>

        <div className="mt-8 card">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Order</p>
              <p className="mono-data mt-1 text-sm text-white/85">{order.id}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Website</p>
              <p className="mt-1 text-sm text-white/85">{order.websiteUrl}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Business</p>
              <p className="mt-1 text-sm text-white/85">
                {order.businessName ?? "—"}
              </p>
            </div>
            {order.businessId ? (
              <a
                href={`/admin/evidence/business/${order.businessId}`}
                className="text-sm text-accent hover:underline"
              >
                View business evidence →
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="h3">
            {observations.length} observation{observations.length === 1 ? "" : "s"}
          </h2>
          {observations.length === 0 ? (
            <p className="muted mt-3 text-sm">
              No evidence rows yet. Either this audit ran before{" "}
              <code>GEO_EVIDENCE_LAYER_ENABLED</code> was set, or the
              validator layer produced no passing outputs.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {observations.map((obs) => (
                <li key={obs.id} className="card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="pill">{obs.provider}</span>
                      <span className="text-xs uppercase tracking-[0.16em] text-white/45">
                        {obs.callType}
                      </span>
                      <span className="mono-data text-xs text-white/50">
                        {obs.observedAt.toISOString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {obs.mentioned !== null ? (
                        <span className={obs.mentioned ? "text-severity-info" : "text-white/45"}>
                          mentioned={String(obs.mentioned)}
                        </span>
                      ) : null}
                      {obs.recommended !== null ? (
                        <span className={obs.recommended ? "text-severity-info" : "text-white/45"}>
                          recommended={String(obs.recommended)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {obs.queryLibraryEntry ? (
                    <p className="mt-3 text-sm text-white/70">
                      Query:{" "}
                      <span className="text-white/85">
                        &ldquo;{obs.queryLibraryEntry.queryText}&rdquo;
                      </span>{" "}
                      <span className="text-white/45">
                        ({obs.queryLibraryEntry.industryNormalized} /{" "}
                        {obs.queryLibraryEntry.geographyRaw})
                      </span>
                    </p>
                  ) : null}

                  {obs.competitorMentions.length > 0 ? (
                    <p className="mt-2 text-xs text-white/55">
                      Named:{" "}
                      {obs.competitorMentions
                        .map((m) => m.competitorName)
                        .join(", ")}
                    </p>
                  ) : null}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-white/55 hover:text-white/80">
                      Raw prompt / response
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                            Prompt
                          </p>
                          <CopyJsonButton text={obs.promptText} label="Copy prompt" />
                        </div>
                        <pre className="mono-data mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-white/[0.08] bg-black/30 p-3 text-xs text-white/70">
                          {obs.promptText}
                        </pre>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                            Response
                          </p>
                          <CopyJsonButton
                            text={obs.rawResponseText}
                            label="Copy response"
                          />
                        </div>
                        <pre className="mono-data mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-white/[0.08] bg-black/30 p-3 text-xs text-white/70">
                          {obs.rawResponseText}
                        </pre>
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <Footer />
    </main>
  );
}
