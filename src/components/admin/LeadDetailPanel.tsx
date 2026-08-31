"use client";

import { useEffect, useState } from "react";
import type { Lead, LeadList, LeadListMembership, LeadSourceRef } from "@prisma/client";

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

type LeadDetail = Lead & {
  sourceRefs: LeadSourceRef[];
  freeCheckSubmission: { id: string; overallScore: number | null; status: string } | null;
  auditOrder: { id: string; paymentStatus: string; auditStatus: string; reportStatus: string } | null;
  business: { id: string; normalizedDomain: string } | null;
  listMemberships: (LeadListMembership & { leadList: LeadList })[];
};

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString();
}

export function LeadDetailPanel({ adminKey, lead: initialLead }: { adminKey: string; lead: LeadDetail }) {
  const [lead, setLead] = useState<LeadDetail>(initialLead);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [notes, setNotes] = useState(lead.notes ?? "");
  const [contactName, setContactName] = useState(lead.contactName ?? "");
  const [contactTitle, setContactTitle] = useState(lead.contactTitle ?? "");
  const [contactEmail, setContactEmail] = useState(lead.contactEmail ?? "");

  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [selectedListId, setSelectedListId] = useState("");

  useEffect(() => {
    authedFetch(adminKey, "/api/admin/leads/lists")
      .then((res) => res.json())
      .then((data) => setLists(data.lists ?? []))
      .catch(() => {});
  }, [adminKey]);

  async function saveFields() {
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, contactName, contactTitle, contactEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setLead((prev) => ({ ...prev, ...data.lead }));
        setMessage("Saved.");
      } else {
        setMessage(data.error ?? "Failed to save.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok) setLead((prev) => ({ ...prev, ...data.lead }));
      else setMessage(data.error ?? "Failed to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function qualify() {
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${lead.id}/qualify`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setLead((prev) => ({ ...prev, ...data.lead }));
      else setMessage(data.error ?? "Qualification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function findContact() {
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/${lead.id}/find-contact`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setLead((prev) => ({ ...prev, ...data.lead }));
      else setMessage(data.error ?? "No contact found.");
    } finally {
      setBusy(false);
    }
  }

  async function addToList() {
    if (!selectedListId) return;
    setListBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/lists/${selectedListId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [lead.id] }),
      });
      if (res.ok) {
        const list = lists.find((l) => l.id === selectedListId);
        if (list) {
          setLead((prev) => ({
            ...prev,
            listMemberships: [
              ...prev.listMemberships.filter((m) => m.leadListId !== selectedListId),
              {
                id: `temp-${selectedListId}`,
                leadId: prev.id,
                leadListId: selectedListId,
                addedAt: new Date(),
                leadList: { id: list.id, name: list.name, description: null, createdAt: new Date(), updatedAt: new Date() },
              },
            ],
          }));
        }
        setSelectedListId("");
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Failed to add to list.");
      }
    } finally {
      setListBusy(false);
    }
  }

  async function removeFromList(leadListId: string) {
    setListBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/lists/${leadListId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [lead.id] }),
      });
      if (res.ok) {
        setLead((prev) => ({
          ...prev,
          listMemberships: prev.listMemberships.filter((m) => m.leadListId !== leadListId),
        }));
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Failed to remove from list.");
      }
    } finally {
      setListBusy(false);
    }
  }

  const availableLists = lists.filter(
    (l) => !lead.listMemberships.some((m) => m.leadListId === l.id),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {message ? (
        <div className="lg:col-span-3 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/80">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-white/40 hover:text-white/70">
            ✕
          </button>
        </div>
      ) : null}

      <div className="card lg:col-span-2">
        <h2 className="h3 mb-4">Business details</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-white/50">Website</dt>
          <dd>
            {lead.website ? (
              <a href={lead.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {lead.domain ?? lead.website}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-white/50">Category</dt>
          <dd>{lead.category ?? "—"}</dd>
          <dt className="text-white/50">Location</dt>
          <dd>{[lead.city, lead.state].filter(Boolean).join(", ") || "—"}</dd>
          <dt className="text-white/50">Address</dt>
          <dd>{lead.address ?? "—"}</dd>
          <dt className="text-white/50">Phone</dt>
          <dd>{lead.phone ?? "—"}</dd>
          <dt className="text-white/50">Google rating</dt>
          <dd>{lead.rating != null ? `${lead.rating} (${lead.reviewCount ?? 0} reviews)` : "—"}</dd>
          <dt className="text-white/50">GeoViz opportunity score</dt>
          <dd className="mono-data">{lead.qualificationScore ?? "—"}</dd>
          <dt className="text-white/50">AI visibility / Free Check</dt>
          <dd>
            {lead.freeCheckSubmission
              ? `${lead.freeCheckSubmission.status} · score ${lead.freeCheckSubmission.overallScore ?? "—"}`
              : "Not run"}
          </dd>
          <dt className="text-white/50">Linked audit</dt>
          <dd>
            {lead.auditOrder
              ? `${lead.auditOrder.paymentStatus} / ${lead.auditOrder.reportStatus}`
              : "None"}
          </dd>
          <dt className="text-white/50">Canonical business</dt>
          <dd>{lead.business?.normalizedDomain ?? "—"}</dd>
          <dt className="text-white/50">Source</dt>
          <dd>
            {lead.source}
            {lead.sourceRefs.length > 1 ? ` (+${lead.sourceRefs.length - 1} more provider${lead.sourceRefs.length > 2 ? "s" : ""})` : ""}
          </dd>
          <dt className="text-white/50">Discovered</dt>
          <dd>{fmtDate(lead.discoveredAt)}</dd>
          <dt className="text-white/50">Qualified</dt>
          <dd>{fmtDate(lead.qualifiedAt)}</dd>
          <dt className="text-white/50">Contacted</dt>
          <dd>{fmtDate(lead.contactedAt)}</dd>
          <dt className="text-white/50">Responded</dt>
          <dd>{fmtDate(lead.respondedAt)}</dd>
        </dl>

        {Array.isArray(lead.qualificationReasons) && lead.qualificationReasons.length > 0 ? (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-medium text-white/70">Qualification reasons</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-white/60">
              {(lead.qualificationReasons as string[]).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={qualify} disabled={busy} className="btn-ghost text-sm disabled:opacity-50">
            Qualify
          </button>
          <button
            onClick={findContact}
            disabled={busy || !ENRICHABLE_STATUSES.has(lead.status)}
            title={ENRICHABLE_STATUSES.has(lead.status) ? "Find contact info" : "Qualify this lead first"}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            Find Contact
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="card">
          <h2 className="h3 mb-4">Status</h2>
          <select
            value={lead.status}
            disabled={busy}
            onChange={(e) => changeStatus(e.target.value)}
            className="input-field w-full text-sm"
          >
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="card">
          <h2 className="h3 mb-4">Lists</h2>
          <ul className="mb-3 space-y-2">
            {lead.listMemberships.length === 0 ? (
              <li className="text-sm text-white/40">Not in any list.</li>
            ) : (
              lead.listMemberships.map((m) => (
                <li key={m.leadListId} className="flex items-center justify-between text-sm">
                  <span className="text-white/80">{m.leadList.name}</span>
                  <button
                    onClick={() => removeFromList(m.leadListId)}
                    disabled={listBusy}
                    className="text-xs text-severity-critical hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>
          {availableLists.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="input-field w-full text-xs"
              >
                <option value="">Add to list…</option>
                {availableLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <button
                onClick={addToList}
                disabled={listBusy || !selectedListId}
                className="btn-ghost px-3 text-xs disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2 className="h3 mb-4">Contact</h2>
          <div className="space-y-3">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact name"
              className="input-field w-full text-sm"
            />
            <input
              value={contactTitle}
              onChange={(e) => setContactTitle(e.target.value)}
              placeholder="Contact title/role"
              className="input-field w-full text-sm"
            />
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Contact email"
              className="input-field w-full text-sm"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Notes"
              className="input-field w-full text-sm"
            />
            <button onClick={saveFields} disabled={busy} className="btn-primary w-full text-sm disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
