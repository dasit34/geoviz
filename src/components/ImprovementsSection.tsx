import { CopyButton } from "@/components/CopyButton";
import { FACT_LABELS, type BusinessFacts } from "@/lib/monitoring/improvements/facts";
import { IMPACT_DISCLAIMER, type ImpactView } from "@/lib/monitoring/improvements/impact";
import type { ImprovementsDashboard } from "@/lib/monitoring/improvements/service";
import { STATUS_LABELS, type TaskStatus } from "@/lib/monitoring/improvements/workflow";
import { CATEGORY_LABELS, type RecommendationCategory } from "@/lib/monitoring/tracking/recommendations";

/**
 * "Improvements" tab (server component; only the copy button is client JS).
 * Turns findings into supervised tasks with drafts, notes, and independent
 * verification. Plain language for a local-business owner. Nothing here
 * edits a website, and before/after measurements are never presented as
 * caused by the change.
 */

type Task = ImprovementsDashboard["tasks"][number];

const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "Not measured" : `${Math.round(r * 100)}%`);
const pts = (c: number | null) => (c === null ? "—" : `${c > 0 ? "+" : ""}${Math.round(c * 100)} pts`);
const PRIORITY = { 1: "Do first", 2: "Next", 3: "Later" } as Record<number, string>;
const VERIFY_LABEL: Record<string, string> = {
  verified: "Verified",
  not_found: "Change not found yet",
  already_present: "Already on your site before this task",
  could_not_verify: "Could not verify",
};
/** FAQ / new-page checks look for the proposed content specifically. */
const verifyLabel = (outcome: string | null, fixKind: string) => {
  const proposed = fixKind === "faq" || fixKind === "page_outline";
  if (proposed && outcome === "verified") return "Verified — newly observed after your change";
  if (proposed && outcome === "not_found") return "Proposed content not found";
  return VERIFY_LABEL[outcome ?? ""] ?? "Checked";
};

function StatusPill({ status }: { status: TaskStatus }) {
  const tone = status === "verified" ? "text-severity-info border-severity-info/40" : status === "implemented" ? "text-accent border-accent/40" : status === "dismissed" ? "text-white/40" : "text-white/70";
  return <span className={`pill text-[10px] ${tone}`}>{STATUS_LABELS[status]}</span>;
}

function Hidden({ token, taskId, action }: { token: string; taskId?: string; action: string }) {
  return (
    <>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="action" value={action} />
      {taskId ? <input type="hidden" name="taskId" value={taskId} /> : null}
    </>
  );
}

function ActionButton({ token, taskId, action, label, ghost = true }: { token: string; taskId: string; action: string; label: string; ghost?: boolean }) {
  return (
    <form action="/api/monitoring/improvements" method="POST">
      <Hidden token={token} taskId={taskId} action={action} />
      <button type="submit" className={ghost ? "btn-ghost px-3 py-1 text-xs" : "btn-primary px-3 py-1 text-xs"}>{label}</button>
    </form>
  );
}

function FactsCard({ token, d }: { token: string; d: ImprovementsDashboard }) {
  const f: BusinessFacts | null = d.facts?.facts ?? null;
  const val = (k: keyof BusinessFacts): string => {
    const v = f?.[k];
    return Array.isArray(v) ? v.join("\n") : v ?? "";
  };
  const keys = Object.keys(FACT_LABELS) as Array<keyof BusinessFacts>;
  const missing = keys.filter((k) => !val(k));
  return (
    <details className="card p-5" open={!d.facts}>
      <summary className="cursor-pointer">
        <span className="font-semibold text-white">Business facts used in drafts</span>
        <span className="ml-2 text-xs text-white/50">
          {d.facts ? `Confirmed ${fmtDate(d.facts.createdAt)} (version ${d.facts.version}) · ${missing.length} missing` : "Not confirmed yet — drafts need these"}
        </span>
      </summary>
      <p className="mt-3 text-xs text-white/55">
        Drafts only use facts you confirm here. Anything missing is marked [MISSING] in drafts — we never fill in addresses, licenses, reviews, services, or areas for you.
        {Object.keys(d.factSuggestions).length > 0 && !d.facts ? " We pre-filled what we found on your website — check every value before saving." : ""}
      </p>
      {d.canEdit ? (
        <form action="/api/monitoring/improvements" method="POST" className="mt-4 grid gap-3 md:grid-cols-2">
          <Hidden token={token} action="save_facts" />
          {keys.map((k) => {
            const list = k === "services" || k === "serviceAreas" || k === "licenses";
            const suggested = !d.facts ? d.factSuggestions[k] : undefined;
            return (
              <label key={k} className={`text-xs text-white/60 ${list ? "md:col-span-1" : ""}`}>
                {FACT_LABELS[k]}
                {list ? " (one per line)" : ""}
                {suggested ? <span className="ml-1 text-white/40">· found on your website</span> : null}
                {list ? (
                  <textarea name={k} rows={3} defaultValue={val(k) || suggested || ""} className="input-field mt-1" />
                ) : (
                  <input name={k} defaultValue={val(k) || suggested || ""} className="input-field mt-1" />
                )}
              </label>
            );
          })}
          <div className="md:col-span-2">
            <button type="submit" className="btn-ghost">Confirm these facts</button>
          </div>
        </form>
      ) : null}
    </details>
  );
}

function Impact({ impact }: { impact: ImpactView }) {
  if (impact.state === "not_implemented") return null;
  if (impact.state === "awaiting") {
    return (
      <div className="mt-3 rounded-md border border-white/[0.06] p-3 text-xs text-white/60">
        <p className="font-semibold text-white/80">AI answers after this change: Awaiting next measurement</p>
        {impact.before ? <p className="mt-1">Before (run of {fmtDate(impact.before.at)}): named in {pct(impact.before.mentionRate)} of {impact.before.measured} measured answers ({pct(impact.before.coverage)} coverage).</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-white/[0.06] p-3 text-xs text-white/60">
      <p className="font-semibold text-white/80">AI answers before and after this change</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <p>Before{impact.before ? ` (${fmtDate(impact.before.at)})` : ""}: {impact.before ? <>named {pct(impact.before.mentionRate)}, cited {pct(impact.before.citationRate)} · {impact.before.measured} of {impact.before.answers} answers measured</> : "no earlier run"}</p>
        <p>After ({fmtDate(impact.after.at)}): named {pct(impact.after.mentionRate)}, cited {pct(impact.after.citationRate)} · {impact.after.measured} of {impact.after.answers} answers measured</p>
      </div>
      <p className="mt-1">
        {impact.comparable ? <>Change across {impact.comparablePairs} comparable question/AI-system pairs: named {pts(impact.mentionChange)}, cited {pts(impact.citationChange)}.</> : <>Not directly comparable{impact.reason ? ` — ${impact.reason.replace(/^Not comparable: /, "")}` : ""}.</>}
      </p>
      <p className="mt-1 text-white/45">{IMPACT_DISCLAIMER}</p>
    </div>
  );
}

function TaskCard({ t, token, canEdit }: { t: Task; token: string; canEdit: boolean }) {
  const draft = t.drafts[0];
  const older = t.drafts.slice(1);
  const v = t.verifications[0];
  const open = t.status !== "verified" && t.status !== "dismissed";
  return (
    <li id={`task-${t.id}`} className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={t.status} />
        <span className="text-xs uppercase tracking-[0.16em] text-white/45">{CATEGORY_LABELS[t.category as RecommendationCategory] ?? t.category} · {PRIORITY[t.priority] ?? "Later"}</span>
        {t.isFixture ? <span className="pill border-severity-warning/40 text-[10px] text-severity-warning">Fixture (demonstration data)</span> : null}
      </div>
      <p className="mt-2 font-semibold text-white">{t.title}</p>
      <p className="mt-1 text-xs text-white/50">{t.priorityReason}</p>

      <div className="mt-3 space-y-1 text-sm">
        <p className="text-xs uppercase tracking-[0.14em] text-white/40">Evidence</p>
        <ul className="space-y-1 text-xs text-white/70">
          {t.evidence.map((e, i) => (
            <li key={i}>
              {e.text}
              {e.url ? <span className="mono-data ml-1 break-all text-white/45">({e.url})</span> : null}
              {e.observedAt ? <span className="ml-1 text-white/40">· {fmtDate(e.observedAt)}</span> : null}
            </li>
          ))}
        </ul>
        {t.occurrences > 1 ? <p className="text-xs text-white/40">Seen {t.occurrences} times; last {fmtDate(t.lastSeenAt)}.</p> : null}
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase tracking-[0.14em] text-white/40">Proposed fix</p>
        <p className="mt-1 text-sm text-white/80">{t.proposedFix}</p>
      </div>

      {draft ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-white/40">Draft · version {draft.version} · {fmtDate(draft.createdAt)}</p>
            <CopyButton text={draft.content} />
            <a className="btn-ghost px-3 py-1 text-xs" href={`/api/monitoring/improvements/draft?token=${encodeURIComponent(token)}&draftId=${draft.id}`}>Download</a>
            {canEdit && open && !t.isFixture ? <ActionButton token={token} taskId={t.id} action="regenerate_draft" label="Refresh draft" /> : null}
          </div>
          {draft.missingFacts.length > 0 ? <p className="mt-1 text-xs text-severity-warning">Needs from you: {draft.missingFacts.join(", ")}</p> : null}
          <pre className="mono-data mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/[0.06] bg-ink-900/60 p-3 text-xs text-white/80">{draft.content}</pre>
          {older.length > 0 ? (
            <details className="mt-2 text-xs text-white/50">
              <summary className="cursor-pointer">Earlier versions ({older.length})</summary>
              {older.map((o) => (
                <pre key={o.id} className="mono-data mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/[0.06] p-2 text-[11px]">
                  {`v${o.version} · ${fmtDate(o.createdAt)}\n${o.content}`}
                </pre>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-1 text-xs text-white/55 sm:grid-cols-2">
        <p>Owner: {t.owner === "unassigned" ? "Not assigned" : t.owner === "customer" ? "You" : "GeoViz"}</p>
        <p>How it's checked: {t.verificationMethod === "scanner" ? `website scanner — ${t.expectedText ?? ""}` : "GeoViz operator review"}</p>
        <p>Created {fmtDate(t.createdAt)}{t.approvedAt ? ` · approved ${fmtDate(t.approvedAt)}` : ""}</p>
        <p>
          {t.implementedAt ? `Marked implemented ${fmtDate(t.implementedAt)}` : "Not implemented yet"}
          {t.verifiedAt ? ` · verified ${fmtDate(t.verifiedAt)}${t.verifiedBy === "operator" ? " (operator check)" : " (website scanner)"}` : ""}
        </p>
        {t.implementationUrl ? <p className="mono-data break-all sm:col-span-2">Published at: {t.implementationUrl}</p> : null}
      </div>

      {v ? (
        <div className="mt-3 rounded-md border border-white/[0.06] p-3 text-xs">
          <p className="font-semibold text-white/80">
            {v.status === "done" ? verifyLabel(v.outcome, t.fixKind) : v.attempts > 0 ? "Couldn't reach the page yet — will retry" : "Check queued"}
            {v.checkedAt ? <span className="ml-2 font-normal text-white/45">{new Date(v.checkedAt).toISOString().replace("T", " ").slice(0, 16)} UTC</span> : null}
          </p>
          <p className="mt-1 text-white/60">Expected: {v.expected}</p>
          {v.observed ? <p className="text-white/60">Observed: {v.observed}</p> : null}
          {v.outcome === "already_present" ? <p className="mt-1 text-white/55">Nothing new to verify. Add the drafted content that isn&apos;t on your site yet, or dismiss this task.</p> : null}
          {v.baselineAt ? <p className="text-white/45">Compared with your site as scanned on {fmtDate(v.baselineAt)} (before you marked this implemented).</p> : null}
          <p className="mono-data break-all text-white/45">{v.url}</p>
          <p className="mt-1 text-white/40">A change being on your page doesn&apos;t mean search engines or AI systems have indexed it yet.</p>
        </div>
      ) : null}

      <Impact impact={t.impact} />

      {t.isFixture ? <p className="mt-3 text-xs text-white/40">Demonstration task — no actions, and no AI measurements are attached.</p> : null}
      {canEdit && !t.isFixture ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {t.status === "suggested" ? <ActionButton token={token} taskId={t.id} action="approve" label="Approve" ghost={false} /> : null}
            {t.status === "approved" ? <ActionButton token={token} taskId={t.id} action="start" label="Start" /> : null}
            {t.status === "implemented" ? <ActionButton token={token} taskId={t.id} action="reopen" label="Reopen" /> : null}
            {t.status === "dismissed" ? <ActionButton token={token} taskId={t.id} action="restore" label="Restore" /> : null}
            {open && t.status !== "implemented" ? (
              <form action="/api/monitoring/improvements" method="POST" className="flex gap-2">
                <Hidden token={token} taskId={t.id} action="dismiss" />
                <input name="reason" placeholder="Why dismiss? (optional)" className="input-field py-1 text-xs" />
                <button className="btn-ghost px-3 py-1 text-xs" type="submit">Dismiss</button>
              </form>
            ) : null}
          </div>
          {t.status === "approved" || t.status === "in_progress" ? (
            <form action="/api/monitoring/improvements" method="POST" className="space-y-2">
              <Hidden token={token} taskId={t.id} action="mark_implemented" />
              <textarea name="notes" rows={2} placeholder="What did you change? (optional)" className="input-field text-xs" />
              {t.fixKind === "page_outline" || t.fixKind === "faq" ? (
                <input name="implementationUrl" required placeholder="Address of the page you published (on your website)" className="input-field text-xs" />
              ) : null}
              <button className="btn-ghost px-3 py-1 text-xs" type="submit">Mark implemented</button>
            </form>
          ) : null}
          <form action="/api/monitoring/improvements" method="POST" className="flex flex-col gap-2 sm:flex-row">
            <Hidden token={token} taskId={t.id} action="add_note" />
            <input name="note" placeholder="Add a note" className="input-field py-1 text-xs" />
            <button className="btn-ghost shrink-0 px-3 py-1 text-xs" type="submit">Add note</button>
          </form>
        </div>
      ) : null}

      {t.events.length > 0 ? (
        <details className="mt-3 text-xs text-white/50">
          <summary className="cursor-pointer">History ({t.events.length})</summary>
          <ul className="mt-2 space-y-1">
            {t.events.map((e) => (
              <li key={e.id}>
                <span className="mono-data text-white/40">{fmtDate(e.createdAt)}</span> · {e.actor === "customer" ? "You" : e.actor === "operator" ? "GeoViz" : "System"}:{" "}
                {e.type === "status_changed" ? `${STATUS_LABELS[e.fromStatus as TaskStatus] ?? e.fromStatus} → ${STATUS_LABELS[e.toStatus as TaskStatus] ?? e.toStatus}` : e.type.replace(/_/g, " ")}
                {e.note ? ` — ${e.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

export function ImprovementsSection({ token, d }: { token: string; d: ImprovementsDashboard }) {
  const todo = d.tasks.filter((t) => ["suggested", "approved", "in_progress"].includes(t.status));
  const implemented = d.tasks.filter((t) => t.status === "implemented");
  const verified = d.tasks.filter((t) => t.status === "verified");
  const dismissed = d.tasks.filter((t) => t.status === "dismissed");
  return (
    <div className="mt-8 space-y-10">
      <p className="muted max-w-3xl text-sm">
        Turn findings into improvements. Each task explains the problem, shows the evidence, and includes a draft you can copy or download. You (or your web
        person) make the change; when you mark it implemented, we check your website independently. We never edit your website.
      </p>

      <FactsCard token={token} d={d} />

      <div>
        <h3 className="h3">To do</h3>
        {d.tasks.length === 0 ? <p className="muted mt-2 text-sm">No improvement tasks yet — create one from a finding below.</p> : null}
        {d.tasks.length > 0 && todo.length === 0 ? <p className="muted mt-2 text-sm">Nothing waiting on you right now.</p> : null}
        <ul className="mt-4 space-y-3">{todo.map((t) => <TaskCard key={t.id} t={t} token={token} canEdit={d.canEdit} />)}</ul>
      </div>

      {implemented.length > 0 ? (
        <div>
          <h3 className="h3">Implemented — being checked</h3>
          <p className="mt-2 text-xs text-white/55">You marked these done. We check the page; until a check passes they stay here.</p>
          <ul className="mt-4 space-y-3">{implemented.map((t) => <TaskCard key={t.id} t={t} token={token} canEdit={d.canEdit} />)}</ul>
        </div>
      ) : null}

      {verified.length > 0 ? (
        <div>
          <h3 className="h3">Verified</h3>
          <ul className="mt-4 space-y-3">{verified.map((t) => <TaskCard key={t.id} t={t} token={token} canEdit={d.canEdit} />)}</ul>
        </div>
      ) : null}

      <div>
        <h3 className="h3">Findings you can turn into tasks</h3>
        {d.available.length === 0 ? (
          <p className="muted mt-2 text-sm">Every current finding already has a task.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {d.available.map((r) => (
              <li key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">{CATEGORY_LABELS[r.category]} · {PRIORITY[r.priority]}</p>
                  <p className="mt-1 text-sm text-white">{r.title}</p>
                  <p className="mt-1 text-xs text-white/50">{r.evidence}</p>
                </div>
                {d.canEdit ? (
                  <form action="/api/monitoring/improvements" method="POST" className="shrink-0">
                    <Hidden token={token} action="create_from_recommendation" />
                    <input type="hidden" name="recommendationId" value={r.id} />
                    <button className="btn-ghost px-3 py-1 text-xs" type="submit">Create task</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {dismissed.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm text-white/60">Dismissed ({dismissed.length})</summary>
          <ul className="mt-4 space-y-3">{dismissed.map((t) => <TaskCard key={t.id} t={t} token={token} canEdit={d.canEdit} />)}</ul>
        </details>
      ) : null}
    </div>
  );
}
