import { notFound } from "next/navigation";

import { isAdminPageRequest } from "@/lib/admin-secret";
import { prisma } from "@/lib/db";
import { describeExpected } from "@/lib/monitoring/improvements/expectations";
import type { Expectation } from "@/lib/monitoring/improvements/drafts";
import { SCANNER_VERIFIABLE, STATUS_LABELS, type FixKind, type TaskStatus } from "@/lib/monitoring/improvements/workflow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Improvement tasks · Admin", robots: { index: false, follow: false } };

const fmt = (d: Date | null) => (d ? d.toISOString().replace("T", " ").slice(0, 16) : "—");

/**
 * Operator review of improvement tasks across subscriptions. Approve,
 * assign, dismiss, regenerate drafts, re-queue scanner checks, and — only
 * for kinds the scanner can't check — record a manual verification with an
 * evidence URL. Nothing here edits a customer website.
 */
export default async function ImprovementsAdminPage({ searchParams }: { searchParams?: { key?: string | string[]; notice?: string } }) {
  if (!isAdminPageRequest({ key: searchParams?.key })) notFound();
  const key = typeof searchParams?.key === "string" ? searchParams.key : "";
  const tasks = await prisma.improvementTask.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: {
      subscription: { select: { id: true, businessName: true, websiteUrl: true } },
      verifications: { orderBy: { createdAt: "desc" }, take: 1 },
      drafts: { orderBy: { version: "desc" }, take: 1, select: { version: true, missingFacts: true } },
    },
  });
  const Hidden = ({ t }: { t: (typeof tasks)[number] }) => (
    <>
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="subscriptionId" value={t.subscriptionId} />
      <input type="hidden" name="taskId" value={t.id} />
    </>
  );
  return (
    <main className="container-page py-10 text-sm text-white/80">
      <h1 className="h2">Improvement tasks</h1>
      <p className="muted mt-2 max-w-3xl">
        Operator review. Scanner-checkable tasks are verified only by the website scanner; manual verification is limited to citation/general tasks and needs an evidence URL.
      </p>
      {searchParams?.notice ? <p className="mt-3 text-severity-warning">{searchParams.notice.slice(0, 200)}</p> : null}
      {tasks.length === 0 ? <p className="muted mt-6">No tasks yet.</p> : null}
      <ul className="mt-6 space-y-3">
        {tasks.map((t) => {
          const v = t.verifications[0];
          const manual = !SCANNER_VERIFIABLE.has(t.fixKind as FixKind);
          return (
            <li key={t.id} className="card p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-white/45">
                {t.subscription.businessName ?? t.subscription.websiteUrl} · {t.fixKind} · {STATUS_LABELS[t.status as TaskStatus] ?? t.status} · owner {t.owner}
                {t.isFixture ? " · FIXTURE" : ""}
              </p>
              <p className="mt-1 font-semibold text-white">{t.title}</p>
              <p className="mt-1 text-xs text-white/55">
                Created {fmt(t.createdAt)} · implemented {fmt(t.implementedAt)} · verified {fmt(t.verifiedAt)} {t.verifiedBy ? `(${t.verifiedBy})` : ""} · seen {t.occurrences}× · draft v{t.drafts[0]?.version ?? "—"}
              </p>
              <p className="mt-1 text-xs text-white/55">Check: {t.expectation ? describeExpected(t.expectation as Expectation) : "—"}</p>
              {v ? <p className="mt-1 text-xs text-white/55">Last check: {v.status} {v.outcome ?? ""} {v.url} {fmt(v.checkedAt)} {v.lastError ?? ""}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {(["approve", "start", "regenerate_draft", "requeue_verification"] as const).map((a) => (
                  <form key={a} action="/api/admin/improvements" method="POST">
                    <Hidden t={t} />
                    <input type="hidden" name="action" value={a} />
                    <button className="btn-ghost px-3 py-1 text-xs" type="submit">{a.replace(/_/g, " ")}</button>
                  </form>
                ))}
                <form action="/api/admin/improvements" method="POST" className="flex gap-1">
                  <Hidden t={t} />
                  <input type="hidden" name="action" value="assign_owner" />
                  <select name="owner" defaultValue={t.owner} className="input-field py-1 text-xs">
                    <option value="customer">customer</option>
                    <option value="operator">operator</option>
                    <option value="unassigned">unassigned</option>
                  </select>
                  <button className="btn-ghost px-3 py-1 text-xs" type="submit">assign</button>
                </form>
                <form action="/api/admin/improvements" method="POST" className="flex gap-1">
                  <Hidden t={t} />
                  <input type="hidden" name="action" value="dismiss" />
                  <input name="reason" placeholder="reason" className="input-field py-1 text-xs" />
                  <button className="btn-ghost px-3 py-1 text-xs" type="submit">dismiss</button>
                </form>
                {manual && t.status === "implemented" ? (
                  <form action="/api/admin/improvements" method="POST" className="flex flex-wrap gap-1">
                    <Hidden t={t} />
                    <input type="hidden" name="action" value="manual_verify" />
                    <input name="evidenceUrl" required placeholder="https://evidence…" className="input-field py-1 text-xs" />
                    <input name="notes" required placeholder="what you checked" className="input-field py-1 text-xs" />
                    <button className="btn-ghost px-3 py-1 text-xs" type="submit">verify (manual)</button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
