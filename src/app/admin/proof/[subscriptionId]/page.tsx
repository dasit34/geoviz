import { notFound } from "next/navigation";

import { ProofSection } from "@/components/ProofSection";
import { isAdminPageRequest } from "@/lib/admin-secret";
import { prisma } from "@/lib/db";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { MAX_QUESTIONS_PER_SET, QUESTION_INTENTS, type QuestionSetRecord } from "@/lib/monitoring/proof/question-set";
import { FINAL_OUTCOMES, MATERIAL_MENTION_CHANGE, MATERIAL_RATE_CHANGE, MIN_COMPARABLE_SAMPLES, OUTCOME_VERSION } from "@/lib/monitoring/proof/experiment";
import { prismaProofStores } from "@/lib/monitoring/proof/prisma-store";
import { loadProofDashboard } from "@/lib/monitoring/proof/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proof Engine · Admin", robots: { index: false, follow: false } };

const fmt = (d: Date | null) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) : "—");

/**
 * Operator view of the Proof Engine for ONE subscription: fixed question set
 * versions (propose → edit → approve → activate; frozen once measured), and
 * improvement experiments (create from an approved task, assess). Read and
 * write are scoped to the subscription in the URL. No provider calls here.
 */
export default async function ProofAdminPage({
  params,
  searchParams,
}: {
  params: { subscriptionId: string };
  searchParams?: { key?: string | string[]; notice?: string };
}) {
  if (!isMonitoringEnabled() || !isAdminPageRequest({ key: searchParams?.key })) notFound();
  const key = typeof searchParams?.key === "string" ? searchParams.key : "";
  const sub = await prisma.monitoringSubscription.findUnique({
    where: { id: params.subscriptionId },
    select: { id: true, websiteUrl: true, businessName: true },
  });
  if (!sub) notFound();

  const [d, tasks] = await Promise.all([
    loadProofDashboard(prismaProofStores, sub, { now: new Date(), recommendations: [] }),
    prisma.improvementTask.findMany({
      where: { subscriptionId: sub.id, status: { in: ["approved", "in_progress", "implemented", "verified"] }, proofExperiment: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, status: true, category: true },
    }),
  ]);

  const Hidden = ({ setId }: { setId?: string }) => (
    <>
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="subscriptionId" value={sub.id} />
      {setId ? <input type="hidden" name="setId" value={setId} /> : null}
    </>
  );
  const Action = ({ action, setId, label }: { action: string; setId: string; label: string }) => (
    <form action="/api/admin/proof" method="POST">
      <Hidden setId={setId} />
      <input type="hidden" name="action" value={action} />
      <button className="btn-ghost px-3 py-1 text-xs" type="submit">{label}</button>
    </form>
  );
  const SetCard = ({ s }: { s: QuestionSetRecord }) => (
    <li className="card p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-white/45">
        v{s.version} · {s.status} · {s.generatorVersion} · created {fmt(s.createdAt)} · approved {fmt(s.approvedAt)} · active {fmt(s.activatedAt)} · first measured {fmt(s.firstMeasuredAt)}
      </p>
      <p className="mt-1 text-xs text-white/55">
        {s.businessCategory ?? "—"} · {[s.city, s.state, s.serviceArea].filter(Boolean).join(", ") || "no location"} {s.notes ? `· ${s.notes}` : ""}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {s.items.map((i) => (
          <li key={i.id}>
            <span className="mono-data text-xs text-white/45">{i.intent}</span> {i.text}
            <span className="block text-xs text-white/40">{i.rationale}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        {s.status === "draft" && s.firstMeasuredAt === null ? <Action action="approve_set" setId={s.id} label="approve (freezes questions)" /> : null}
        {s.status === "approved" ? <Action action="activate_set" setId={s.id} label="activate (replaces tracked questions)" /> : null}
        <Action action="new_version" setId={s.id} label="new version from this" />
      </div>
      {s.status === "draft" && s.firstMeasuredAt === null ? (
        <form action="/api/admin/proof" method="POST" className="mt-3">
          <Hidden setId={s.id} />
          <input type="hidden" name="action" value="edit_draft" />
          <textarea name="items" rows={Math.min(12, s.items.length + 2)} className="input-field w-full font-mono text-xs" defaultValue={s.items.map((i) => `${i.intent} | ${i.text} | ${i.rationale}`).join("\n")} />
          <button className="btn-ghost mt-2 px-3 py-1 text-xs" type="submit">save draft</button>
        </form>
      ) : null}
    </li>
  );

  return (
    <main className="container-page py-10 text-sm text-white/80">
      <h1 className="h2">Proof Engine</h1>
      <p className="muted mt-2 max-w-3xl">
        {sub.businessName ?? sub.websiteUrl} · {sub.websiteUrl}. Fixed question sets are frozen once approved or measured — change them by creating a new version. Outcome rules {OUTCOME_VERSION}: at least {MIN_COMPARABLE_SAMPLES} comparable answers, a change of ±{Math.round(MATERIAL_RATE_CHANGE * 100)} points in the share of answers naming the business and at least {MATERIAL_MENTION_CHANGE} answers. No causation is ever claimed.
      </p>
      {searchParams?.notice ? <p className="mt-3 text-severity-warning">{searchParams.notice.slice(0, 200)}</p> : null}

      <section className="mt-8">
        <h2 className="h3">Question sets</h2>
        <ul className="mt-3 space-y-3">
          {d.questionSets.length === 0 ? <li className="muted">No question sets yet.</li> : d.questionSets.map((s) => <SetCard key={s.id} s={s} />)}
        </ul>
        <form action="/api/admin/proof" method="POST" className="card mt-4 grid gap-2 p-4 sm:grid-cols-2">
          <Hidden />
          <input type="hidden" name="action" value="propose_draft" />
          <p className="text-xs text-white/55 sm:col-span-2">Propose a new draft (deterministic, max {MAX_QUESTIONS_PER_SET} questions; intents: {QUESTION_INTENTS.join(", ")}). Local questions need a city or service area; competitor questions need real names.</p>
          <input name="businessName" className="input-field" placeholder="Business name" defaultValue={sub.businessName ?? ""} />
          <input name="businessCategory" className="input-field" placeholder="Category, e.g. roofing contractor" required />
          <input name="categoryPlural" className="input-field" placeholder="Category plural (optional)" />
          <input name="services" className="input-field" placeholder="Services, comma-separated" />
          <input name="city" className="input-field" placeholder="City" />
          <input name="state" className="input-field" placeholder="State" />
          <input name="serviceArea" className="input-field" placeholder="Service area" />
          <input name="competitorNames" className="input-field" placeholder="Real competitor names, comma-separated" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isLocal" /> Local business</label>
          <button className="btn-primary sm:col-span-2" type="submit">Propose draft</button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="h3">Create experiment</h2>
        {tasks.length === 0 ? (
          <p className="muted mt-2">No approved improvement tasks without an experiment.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="card flex flex-wrap items-center gap-2 p-3">
                <span className="flex-1">{t.title} <span className="text-xs text-white/45">({t.status}, {t.category})</span></span>
                <form action="/api/admin/proof" method="POST" className="flex gap-1">
                  <Hidden />
                  <input type="hidden" name="action" value="create_experiment" />
                  <input type="hidden" name="taskId" value={t.id} />
                  <input name="expectedCategory" className="input-field py-1 text-xs" placeholder={`expected category (${t.category})`} />
                  <button className="btn-ghost px-3 py-1 text-xs" type="submit">create</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="h3">Assess experiments</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {d.experiments.map((v) => (
            <form key={v.experimentId} action="/api/admin/proof" method="POST">
              <Hidden />
              <input type="hidden" name="action" value="assess_experiment" />
              <input type="hidden" name="experimentId" value={v.experimentId} />
              <button className="btn-ghost px-3 py-1 text-xs" type="submit" disabled={v.outcome.recorded && FINAL_OUTCOMES.has(v.outcome.state as never)}>
                assess: {v.action.title.slice(0, 40)}
              </button>
            </form>
          ))}
        </div>
      </section>

      <ProofSection d={d} />
    </main>
  );
}
