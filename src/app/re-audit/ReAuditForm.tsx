"use client";

import { useState, type FormEvent } from "react";

export function ReAuditForm({
  previousOrderId,
  businessLabel,
  websiteUrl,
  defaultEmail,
}: {
  previousOrderId: string;
  businessLabel: string;
  websiteUrl: string;
  defaultEmail: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();

    try {
      const res = await fetch("/api/checkout/re-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousOrderId, email }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!res.ok || !body.url) {
        setError(body.error ?? "Could not start checkout. Please try again.");
        setSubmitting(false);
        return;
      }

      window.location.href = body.url;
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-[0.14em] text-white/40">Business</p>
        <p className="text-sm text-white/85">{businessLabel}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-[0.14em] text-white/40">Website</p>
        <p className="text-sm text-white/85">{websiteUrl}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-white/85">
          Delivery email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          className="input-field"
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full justify-center text-base disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Redirecting to checkout…" : "Continue to Payment — $59"}
      </button>

      <p className="text-center text-xs text-white/40">
        Secure payment via Stripe. One-time charge of $59 USD.
      </p>
    </form>
  );
}
