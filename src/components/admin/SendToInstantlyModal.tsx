"use client";

import { useEffect, useState } from "react";

type Campaign = { id: string; name: string; status: string | null };
type SkippedLead = { leadId: string; businessName: string | null; reason: string };
type PayloadPreviewItem = {
  leadId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  customVariables: Record<string, string | number | boolean | null>;
};
type PreviewResponse = {
  dryRun: true;
  eligibleCount: number;
  skippedCount: number;
  eligible: { leadId: string; businessName: string; email: string | null }[];
  skipped: SkippedLead[];
  payloadPreview: PayloadPreviewItem[];
};
type SendResponse = {
  dryRun: false;
  sentCount: number;
  failedCount: number;
  eligibleCount: number;
  skippedCount: number;
  skipped: SkippedLead[];
};

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

export function SendToInstantlyModal({
  adminKey,
  leadIds,
  onClose,
  onSent,
}: {
  adminKey: string;
  leadIds: string[];
  onClose: () => void;
  onSent?: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [sendResult, setSendResult] = useState<SendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mock/local mode: no Instantly connection configured yet (or simply
  // no campaigns exist there yet) — preview still works fully locally;
  // only the actual "Send" step is unavailable until a real campaign
  // can be selected.
  const mockMode = campaignsLoaded && (campaigns.length === 0 || !!campaignsError);

  useEffect(() => {
    authedFetch(adminKey, "/api/admin/leads/outbound/campaigns")
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setCampaigns(data.campaigns ?? []);
        else setCampaignsError(data.error ?? "Failed to load campaigns.");
      })
      .catch(() => setCampaignsError("Network error loading campaigns."))
      .finally(() => setCampaignsLoaded(true));
  }, [adminKey]);

  async function runPreview() {
    if (!mockMode && !campaignId) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setSendResult(null);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/outbound/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, campaignId: campaignId || undefined }),
      });
      const data = await res.json();
      if (res.ok) setPreview(data);
      else setError(data.error ?? "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend() {
    if (!campaignId || !preview) return;
    const campaign = campaigns.find((c) => c.id === campaignId);
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/outbound/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds,
          campaignId,
          campaignName: campaign?.name ?? null,
          confirm: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult(data);
        onSent?.();
      } else {
        setError(data.error ?? "Send failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="card w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="h3">Send to Instantly</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-white/60">
          {leadIds.length} lead{leadIds.length === 1 ? "" : "s"} selected.
        </p>

        {mockMode ? (
          <div className="mb-4 rounded-md border border-accent/30 bg-accent/10 px-4 py-2 text-xs text-white/70">
            No Instantly campaign connected yet — running in local preview
            mode. You can still see exactly what GeoViz would send; the
            actual send is disabled until Instantly is connected.
          </div>
        ) : null}

        {!sendResult ? (
          <>
            {!mockMode ? (
              <>
                <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
                  Campaign
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => {
                    setCampaignId(e.target.value);
                    setPreview(null);
                  }}
                  disabled={busy || campaigns.length === 0}
                  className="input-field mb-4 w-full"
                >
                  <option value="">Select a campaign…</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.status ? ` (${c.status})` : ""}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {error ? (
              <p className="mb-4 text-sm text-severity-critical">{error}</p>
            ) : null}

            {!preview ? (
              <button
                onClick={runPreview}
                disabled={busy || (!mockMode && !campaignId)}
                className="btn-primary w-full text-sm disabled:opacity-50"
              >
                {busy ? "Checking…" : mockMode ? "Preview (mock mode)" : "Preview"}
              </button>
            ) : (
              <div>
                <div className="mb-4 rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm">
                  <p className="text-white/80">
                    <strong>{preview.eligibleCount}</strong> eligible,{" "}
                    <strong>{preview.skippedCount}</strong> skipped.
                  </p>
                  {preview.skipped.length > 0 ? (
                    <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-white/50">
                      {preview.skipped.map((s) => (
                        <li key={s.leadId}>
                          {s.businessName ?? s.leadId}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {preview.payloadPreview.length > 0 ? (
                  <div className="mb-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
                      What GeoViz would send
                    </p>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {preview.payloadPreview.map((p) => (
                        <pre
                          key={p.leadId}
                          className="overflow-x-auto rounded-md border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-white/70"
                        >
{JSON.stringify(
  {
    email: p.email,
    first_name: p.firstName,
    last_name: p.lastName,
    company_name: p.companyName,
    website: p.website,
    city: p.city,
    state: p.state,
    phone: p.phone,
    custom_variables: p.customVariables,
  },
  null,
  2,
)}
                        </pre>
                      ))}
                    </div>
                  </div>
                ) : null}

                {mockMode ? (
                  <p className="text-xs text-white/50">
                    Connect Instantly (add <code>INSTANTLY_API_KEY</code>) and
                    pick a real campaign to actually send.
                  </p>
                ) : (
                  <button
                    onClick={confirmSend}
                    disabled={busy || preview.eligibleCount === 0}
                    className="btn-primary w-full text-sm disabled:opacity-50"
                  >
                    {busy ? "Sending…" : `Send ${preview.eligibleCount} lead${preview.eligibleCount === 1 ? "" : "s"}`}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="mb-4 rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm">
              <p className="text-white/80">
                <strong>{sendResult.sentCount}</strong> sent,{" "}
                <strong>{sendResult.failedCount}</strong> failed,{" "}
                <strong>{sendResult.skippedCount}</strong> skipped.
              </p>
            </div>
            <button onClick={onClose} className="btn-primary w-full text-sm">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
