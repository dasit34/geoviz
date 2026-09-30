"use client";

import { useState, type FormEvent } from "react";

export type MonitoringPlanOption = {
  key: string;
  name: string;
  description: string;
  amountLabel: string;
  intervalLabel: string;
};

export function MonitoringSignupForm({ plans }: { plans: MonitoringPlanOption[] }) {
  const [planKey, setPlanKey] = useState(plans[0]?.key ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/checkout/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          websiteUrl: String(data.get("websiteUrl") ?? "").trim(),
          email: String(data.get("email") ?? "").trim(),
          businessName: String(data.get("businessName") ?? "").trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error ?? "Could not start checkout. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6 sm:p-8">
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Plan</legend>
        {plans.map((p) => (
          <label
            key={p.key}
            className={`block cursor-pointer rounded-md border p-4 ${
              planKey === p.key ? "border-accent bg-accent/5" : "border-white/10"
            }`}
          >
            <input
              type="radio"
              name="planKey"
              value={p.key}
              checked={planKey === p.key}
              onChange={() => setPlanKey(p.key)}
              className="sr-only"
            />
            <span className="flex items-baseline justify-between gap-4">
              <span className="font-semibold text-white">{p.name}</span>
              <span className="mono-data text-white">
                {p.amountLabel} <span className="text-xs text-white/50">{p.intervalLabel}</span>
              </span>
            </span>
            <span className="mt-1 block text-sm text-white/60">{p.description}</span>
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="websiteUrl" className="text-sm text-white/70">Website to monitor</label>
        <input id="websiteUrl" name="websiteUrl" required placeholder="yourbusiness.com" className="input-field mt-1" />
      </div>
      <div>
        <label htmlFor="email" className="text-sm text-white/70">Email for reports and billing</label>
        <input id="email" name="email" type="email" required placeholder="you@yourbusiness.com" className="input-field mt-1" />
      </div>
      <div>
        <label htmlFor="businessName" className="text-sm text-white/70">Business name (optional)</label>
        <input id="businessName" name="businessName" className="input-field mt-1" />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-severity-critical">{error}</p>
      ) : null}

      <button type="submit" disabled={submitting || !planKey} className="btn-primary w-full justify-center">
        {submitting ? "Opening secure checkout…" : "Continue to secure checkout"}
      </button>
      <p className="text-xs text-white/45">
        Billed through Stripe. Cancel any time from your monitoring page. Scores are directional
        measurements, not guaranteed rankings or AI recommendations.
      </p>
    </form>
  );
}
