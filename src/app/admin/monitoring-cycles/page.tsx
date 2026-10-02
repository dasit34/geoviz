import { notFound } from "next/navigation";

import { isAdminPageRequest } from "@/lib/admin-secret";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monitoring cycles · Admin", robots: { index: false, follow: false } };

/**
 * Read-only operator view of prompt-tracking cycles: cost, coverage, and —
 * most importantly — samples whose provider outcome is UNKNOWN (the request
 * may have been processed and billed, but no answer was recorded). Those
 * are never retried automatically; re-issuing them is an explicit operator
 * action: `scripts/monitoring-run-cycle.ts --subscription <id> --cycle-key
 * <key> --retry-unknown --confirm-possible-duplicate-charge`.
 */
export default async function MonitoringCyclesAdminPage({ searchParams }: { searchParams?: { key?: string | string[] } }) {
  if (!isAdminPageRequest({ key: searchParams?.key })) notFound();

  const [cycles, unknown] = await Promise.all([
    prisma.monitoringCycle.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true, cycleKey: true, status: true, trigger: true, startedAt: true, completedAt: true, samplesPerPrompt: true,
        unknownOutcomes: true, estimatedCostUsd: true, summary: true,
        subscription: { select: { id: true, businessName: true, websiteUrl: true } },
      },
    }),
    prisma.promptRunResult.findMany({
      where: { callState: { in: ["unknown", "in_flight"] } },
      orderBy: { claimedAt: "desc" },
      take: 100,
      select: {
        id: true, provider: true, sampleIndex: true, callState: true, errorMessage: true, requestStartedAt: true, providerRequestId: true,
        trackedPrompt: { select: { text: true } }, cycle: { select: { cycleKey: true, subscriptionId: true } },
      },
    }),
  ]);
  const usd = (d: unknown) => (d === null || d === undefined ? "—" : `$${Number(d).toFixed(4)}`);
  const pct = (x: unknown) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "—");

  return (
    <main className="container-page py-12">
      <h1 className="h2">Monitoring cycles</h1>
      <p className="muted mt-2 text-sm">
        Guarantee: at most one automatic provider request per sample. Samples marked <strong>unknown</strong> may have been billed
        without an answer being recorded and are never retried automatically.
      </p>

      <h2 className="h3 mt-10">Needs review — unknown / in-flight samples ({unknown.length})</h2>
      {unknown.length === 0 ? (
        <p className="muted mt-2 text-sm">None.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-white/45">
            <tr><th className="py-1.5">State</th><th>Provider</th><th>Sample</th><th>Question</th><th>Started</th><th>Request id</th><th>Cycle</th></tr>
          </thead>
          <tbody>
            {unknown.map((u) => (
              <tr key={u.id} className="border-t border-white/[0.06] align-top">
                <td className="py-1.5 text-severity-warning">{u.callState}</td>
                <td>{u.provider}</td>
                <td className="mono-data">#{u.sampleIndex}</td>
                <td className="max-w-xs text-white/80">{u.trackedPrompt.text}</td>
                <td className="mono-data text-white/60">{u.requestStartedAt?.toISOString().slice(0, 16) ?? "—"}</td>
                <td className="mono-data text-white/60">{u.provider === "openai" && u.providerRequestId ? "retrievable (OpenAI)" : "not retrievable"}</td>
                <td className="mono-data text-white/60">{u.cycle.subscriptionId} / {u.cycle.cycleKey}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="h3 mt-10">Recent cycles</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead className="text-xs uppercase text-white/45">
          <tr><th className="py-1.5">Started</th><th>Business</th><th>Status</th><th>Samples/pair</th><th>Answers</th><th>Coverage</th><th>Unknown</th><th>Cost</th></tr>
        </thead>
        <tbody>
          {cycles.map((c) => {
            const s = (c.summary ?? {}) as { answers?: number; coverage?: number };
            return (
              <tr key={c.id} className="border-t border-white/[0.06]">
                <td className="mono-data py-1.5 text-white/60">{c.startedAt.toISOString().slice(0, 16)}</td>
                <td>{c.subscription.businessName ?? c.subscription.websiteUrl}</td>
                <td className={c.status === "needs_review" ? "text-severity-warning" : ""}>{c.status}</td>
                <td className="mono-data">{c.samplesPerPrompt}</td>
                <td className="mono-data">{s.answers ?? "—"}</td>
                <td className="mono-data">{pct(s.coverage)}</td>
                <td className="mono-data">{c.unknownOutcomes}</td>
                <td className="mono-data">{usd(c.estimatedCostUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
