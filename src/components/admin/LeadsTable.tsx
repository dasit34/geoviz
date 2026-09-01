"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Lead } from "@prisma/client";
import { serializeLeadsToCsv } from "@/lib/leads/csv";
import { SendToInstantlyModal } from "@/components/admin/SendToInstantlyModal";

const STATUS_VALUES = [
  "NEW",
  "QUALIFIED",
  "NOT_QUALIFIED",
  "READY_FOR_CONTACT",
  "CONTACTED",
  "RESPONDED",
  "FREE_CHECK",
  "AUDIT_PURCHASED",
  "CLOSED",
  "DO_NOT_CONTACT",
] as const;

const ENRICHABLE_STATUSES = new Set(["QUALIFIED", "READY_FOR_CONTACT"]);
const PAGE_SIZE = 25;

type SortKey = "businessName" | "qualificationScore" | "status" | "createdAt";

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

export function LeadsTable({
  adminKey,
  initialLeads,
  leadListId,
}: {
  adminKey: string;
  initialLeads: Lead[];
  /** When set, this table is rendered on a list-detail page — enables a "Remove from this list" bulk action. */
  leadListId?: string;
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addText, setAddText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [instantlyModalOpen, setInstantlyModalOpen] = useState(false);

  useEffect(() => {
    authedFetch(adminKey, "/api/admin/leads/lists")
      .then((res) => res.json())
      .then((data) => setLists(data.lists ?? []))
      .catch(() => {});
  }, [adminKey]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function patchLead(id: string, patch: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length };
    for (const s of STATUS_VALUES) counts[s] = 0;
    for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
    return counts;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = leads;
    if (statusFilter !== "all") rows = rows.filter((l) => l.status === statusFilter);
    if (q) {
      rows = rows.filter((l) =>
        [l.businessName, l.website, l.domain, l.city, l.category, l.state]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "businessName") cmp = a.businessName.localeCompare(b.businessName);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "qualificationScore")
        cmp = (a.qualificationScore ?? -1) - (b.qualificationScore ?? -1);
      else cmp = a.createdAt.valueOf() - b.createdAt.valueOf();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [leads, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const allSelected = pageRows.every((l) => prev.has(l.id));
      const next = new Set(prev);
      for (const l of pageRows) {
        if (allSelected) next.delete(l.id);
        else next.add(l.id);
      }
      return next;
    });
  }

  async function changeStatus(id: string, status: string) {
    setBusy(id, true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok) patchLead(id, data.lead);
      else setMessage(data.error ?? "Failed to update status.");
    } finally {
      setBusy(id, false);
    }
  }

  async function qualifyOne(id: string) {
    setBusy(id, true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${id}/qualify`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) patchLead(id, data.lead);
      else setMessage(data.error ?? "Qualification failed.");
    } finally {
      setBusy(id, false);
    }
  }

  async function findContact(id: string) {
    setBusy(id, true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${id}/find-contact`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) patchLead(id, data.lead);
      else setMessage(data.error ?? "No contact found.");
    } finally {
      setBusy(id, false);
    }
  }

  async function deleteOne(id: string) {
    if (!confirm("Delete this lead permanently?")) return;
    setBusy(id, true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Failed to delete.");
      }
    } finally {
      setBusy(id, false);
    }
  }

  async function bulkSetStatus(status: string) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (selectedIds.has(l.id) ? { ...l, status } : l)),
        );
        setSelectedIds(new Set());
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Bulk update failed.");
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} lead(s) permanently?`)) return;
    setBulkBusy(true);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), delete: true }),
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
        setSelectedIds(new Set());
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Bulk delete failed.");
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkQualify() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size > 25) {
      setMessage("Bulk qualify is limited to 25 leads at a time — select fewer.");
      return;
    }
    setBulkBusy(true);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/qualify-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        const byId = new Map(
          (data.results as { id: string; score: number; qualified: boolean }[]).map(
            (r) => [r.id, r],
          ),
        );
        setLeads((prev) =>
          prev.map((l) => {
            const r = byId.get(l.id);
            if (!r) return l;
            return {
              ...l,
              qualificationScore: r.score,
              status: r.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
            };
          }),
        );
        setSelectedIds(new Set());
      } else {
        setMessage(data.error ?? "Bulk qualification failed.");
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkEnrich() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size > 25) {
      setMessage("Bulk enrich is limited to 25 leads at a time — select fewer.");
      return;
    }
    setBulkBusy(true);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/enrich-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        type EnrichResult = {
          id: string;
          ok: boolean;
          error?: string;
          contactEmail?: string | null;
          contactName?: string | null;
          contactTitle?: string | null;
          contactSource?: string | null;
        };
        const results = data.results as EnrichResult[];
        const byId = new Map(results.map((r) => [r.id, r]));
        setLeads((prev) =>
          prev.map((l) => {
            const r = byId.get(l.id);
            if (!r || !r.ok) return l;
            return {
              ...l,
              contactEmail: r.contactEmail ?? l.contactEmail,
              contactName: r.contactName ?? l.contactName,
              contactTitle: r.contactTitle ?? l.contactTitle,
              contactSource: r.contactSource ?? l.contactSource,
            };
          }),
        );
        const okCount = results.filter((r) => r.ok).length;
        setMessage(`Enriched ${okCount} of ${results.length} selected lead(s).`);
        setSelectedIds(new Set());
      } else {
        setMessage(data.error ?? "Bulk enrich failed.");
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkAddToList(targetListId: string) {
    if (selectedIds.size === 0 || !targetListId) return;
    setBulkBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/lists/${targetListId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Added ${data.added} lead(s) to list.`);
        setSelectedIds(new Set());
      } else {
        setMessage(data.error ?? "Failed to add to list.");
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkRemoveFromList() {
    if (selectedIds.size === 0 || !leadListId) return;
    setBulkBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/lists/${leadListId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
        setSelectedIds(new Set());
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Failed to remove from list.");
      }
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv() {
    const csv = serializeLeadsToCsv(filtered as unknown as Record<string, unknown>[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geoviz-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function submitManualAdd() {
    const lines = addText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setAddBusy(true);
    try {
      // One line per lead: "Business Name | website | city | state | category"
      const rows = lines.map((line) => {
        const [businessName, website, city, state, category] = line
          .split("|")
          .map((s) => s.trim());
        return { businessName, website, city, state, category };
      });
      const res = await authedFetch(adminKey, "/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: rows }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Added ${data.created} lead(s)${data.skipped.length ? `, ${data.skipped.length} skipped` : ""}.`);
        setAddText("");
        setAddFormOpen(false);
        window.location.reload();
      } else {
        setMessage(data.error ?? "Failed to add leads.");
      }
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div>
      {message ? (
        <div className="mb-4 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/80">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-white/40 hover:text-white/70">
            ✕
          </button>
        </div>
      ) : null}

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => { setStatusFilter("all"); setPage(1); }}
          className={`pill ${statusFilter === "all" ? "border-accent text-accent" : ""}`}
        >
          All ({statusCounts.all})
        </button>
        {STATUS_VALUES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`pill ${statusFilter === s ? "border-accent text-accent" : ""}`}
          >
            {s} ({statusCounts[s] ?? 0})
          </button>
        ))}
      </div>

      {/* Search + manual add */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search business, website, city, category…"
          className="input-field max-w-sm"
        />
        <button onClick={() => setAddFormOpen((v) => !v)} className="btn-ghost text-sm">
          {addFormOpen ? "Cancel" : "Add Lead(s)"}
        </button>
        <button onClick={exportCsv} className="btn-ghost text-sm">
          Export CSV
        </button>
      </div>

      {addFormOpen ? (
        <div className="card mb-6">
          <p className="mb-2 text-sm text-white/70">
            One lead per line:{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
              Business Name | website | city | state | category
            </code>{" "}
            (only business name is required).
          </p>
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            rows={5}
            className="input-field w-full font-mono text-sm"
            placeholder="Rick's Plumbing | https://ricksplumbing.com | Toledo | OH | plumbing"
          />
          <button
            onClick={submitManualAdd}
            disabled={addBusy || addText.trim().length === 0}
            className="btn-primary mt-3 text-sm disabled:opacity-50"
          >
            {addBusy ? "Adding…" : "Add"}
          </button>
        </div>
      ) : null}

      {/* Bulk action bar */}
      {selectedIds.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-4 py-2">
          <span className="text-sm text-white/80">{selectedIds.size} selected</span>
          <button onClick={bulkQualify} disabled={bulkBusy} className="btn-ghost text-xs disabled:opacity-50">
            Qualify selected
          </button>
          <button onClick={bulkEnrich} disabled={bulkBusy} className="btn-ghost text-xs disabled:opacity-50">
            Enrich Contacts
          </button>
          <button
            onClick={() => setInstantlyModalOpen(true)}
            disabled={bulkBusy || selectedIds.size > 25}
            title={selectedIds.size > 25 ? "Send to Instantly is limited to 25 leads at a time — select fewer." : undefined}
            className="btn-ghost text-xs disabled:opacity-50"
          >
            Send to Instantly
          </button>
          <select
            disabled={bulkBusy}
            onChange={(e) => e.target.value && bulkSetStatus(e.target.value)}
            defaultValue=""
            className="input-field w-auto text-xs"
          >
            <option value="" disabled>Set status…</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={bulkDelete} disabled={bulkBusy} className="btn-ghost text-xs text-severity-critical disabled:opacity-50">
            Delete selected
          </button>
          {lists.length > 0 ? (
            <select
              disabled={bulkBusy}
              onChange={(e) => e.target.value && bulkAddToList(e.target.value)}
              defaultValue=""
              className="input-field w-auto text-xs"
            >
              <option value="" disabled>Add to list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          ) : null}
          {leadListId ? (
            <button onClick={bulkRemoveFromList} disabled={bulkBusy} className="btn-ghost text-xs text-severity-critical disabled:opacity-50">
              Remove from this list
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={pageRows.length > 0 && pageRows.every((l) => selectedIds.has(l.id))}
                  onChange={toggleSelectAllVisible}
                />
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("businessName")}>
                Business
              </th>
              <th className="px-3 py-2">Industry</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Website</th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("qualificationScore")}>
                Score
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("status")}>
                Status
              </th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Source</th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("createdAt")}>
                Added
              </th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((lead) => {
              const busy = busyIds.has(lead.id);
              return (
                <tr key={lead.id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelected(lead.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-white/90">
                    <Link
                      href={`/admin/leads/${lead.id}?key=${encodeURIComponent(adminKey)}`}
                      className="hover:text-accent hover:underline"
                    >
                      {lead.businessName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-white/60">{lead.category ?? "—"}</td>
                  <td className="px-3 py-2 text-white/60">
                    {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {lead.website ? (
                      <a href={lead.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {lead.domain ?? lead.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{lead.qualificationScore ?? "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={lead.status}
                      disabled={busy}
                      onChange={(e) => changeStatus(lead.id, e.target.value)}
                      className="input-field w-auto py-1 text-xs"
                    >
                      {STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-white/60">
                    {lead.contactEmail ?? lead.contactName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-white/60">{lead.source}</td>
                  <td className="px-3 py-2 text-white/60">
                    {lead.createdAt.toLocaleDateString?.() ?? String(lead.createdAt).slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => qualifyOne(lead.id)}
                        disabled={busy}
                        className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Qualify
                      </button>
                      <button
                        onClick={() => findContact(lead.id)}
                        disabled={busy || !ENRICHABLE_STATUSES.has(lead.status)}
                        title={
                          ENRICHABLE_STATUSES.has(lead.status)
                            ? "Find contact info"
                            : "Qualify this lead first"
                        }
                        className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Find Contact
                      </button>
                      <button
                        onClick={() => deleteOne(lead.id)}
                        disabled={busy}
                        className="btn-ghost px-2 py-1 text-xs text-severity-critical disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-white/40">
                  No leads match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-white/60">
        <span>
          {filtered.length} lead{filtered.length === 1 ? "" : "s"} · page {currentPage} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="btn-ghost px-3 py-1 text-xs disabled:opacity-50"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="btn-ghost px-3 py-1 text-xs disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {instantlyModalOpen ? (
        <SendToInstantlyModal
          adminKey={adminKey}
          leadIds={Array.from(selectedIds)}
          onClose={() => setInstantlyModalOpen(false)}
          onSent={() => setSelectedIds(new Set())}
        />
      ) : null}
    </div>
  );
}
