"use client";

import Link from "next/link";
import { useState } from "react";

export type LeadListSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string | Date;
  memberCount: number;
};

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

export function LeadListsPanel({
  adminKey,
  initialLists,
}: {
  adminKey: string;
  initialLists: LeadListSummary[];
}) {
  const [lists, setLists] = useState(initialLists);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createList() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setLists((prev) => [{ ...data.list, memberCount: 0 }, ...prev]);
        setName("");
        setDescription("");
      } else {
        setMessage(data.error ?? "Failed to create list.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteList(id: string) {
    if (!confirm("Delete this list? Leads themselves are not deleted.")) return;
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/lists/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLists((prev) => prev.filter((l) => l.id !== id));
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Failed to delete list.");
      }
    } finally {
      setBusy(false);
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

      <div className="card mb-8">
        <h2 className="h3 mb-4">New list</h2>
        <div className="flex flex-wrap gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Columbus HVAC"
            className="input-field max-w-xs"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="input-field max-w-sm flex-1"
          />
          <button
            onClick={createList}
            disabled={busy || !name.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Leads</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.id} className="border-b border-white/5">
                <td className="px-3 py-2 font-medium text-white/90">
                  <Link
                    href={`/admin/leads/lists/${l.id}?key=${encodeURIComponent(adminKey)}`}
                    className="hover:text-accent hover:underline"
                  >
                    {l.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-white/60">{l.description ?? "—"}</td>
                <td className="px-3 py-2 text-white/60">{l.memberCount}</td>
                <td className="px-3 py-2 text-white/60">
                  {new Date(l.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => deleteList(l.id)}
                    disabled={busy}
                    className="btn-ghost px-2 py-1 text-xs text-severity-critical disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {lists.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-white/40">
                  No lists yet — create one above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
