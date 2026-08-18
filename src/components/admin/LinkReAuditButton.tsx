"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LinkReAuditButton({
  adminKey,
  orderId,
}: {
  adminKey: string;
  orderId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/link-re-audit?key=${encodeURIComponent(adminKey)}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok) {
        router.refresh();
      } else {
        setError(data.error ?? "Failed to link.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={onClick} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
        {busy ? "Searching…" : "Link as Re-Audit"}
      </button>
      {error ? <p className="mt-2 text-sm text-severity-critical">{error}</p> : null}
    </div>
  );
}
