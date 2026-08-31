"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

export function LeadListHeaderActions({
  adminKey,
  listId,
  initialName,
  initialDescription,
}: {
  adminKey: string;
  listId: string;
  initialName: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this list? Leads themselves are not deleted.")) return;
    setBusy(true);
    try {
      const res = await authedFetch(adminKey, `/api/admin/leads/lists/${listId}`, { method: "DELETE" });
      if (res.ok) router.push(`/admin/leads/lists?key=${encodeURIComponent(adminKey)}`);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="input-field text-sm" />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="input-field text-sm"
        />
        <button onClick={save} disabled={busy || !name.trim()} className="btn-primary text-xs disabled:opacity-50">
          Save
        </button>
        <button onClick={() => setEditing(false)} disabled={busy} className="btn-ghost text-xs">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
        Rename
      </button>
      <button onClick={remove} disabled={busy} className="btn-ghost text-xs text-severity-critical disabled:opacity-50">
        Delete list
      </button>
    </div>
  );
}
