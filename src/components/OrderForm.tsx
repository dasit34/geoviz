"use client";

import { useState, type FormEvent } from "react";

type Defaults = {
  websiteUrl?: string;
  email?: string;
};

type FieldErrors = Partial<
  Record<"websiteUrl" | "email" | "businessName" | "competitorUrl", string[]>
>;

export function OrderForm({
  defaults,
  checkoutEnabled = true,
  testBypassEnabled = false,
}: {
  defaults?: Defaults;
  checkoutEnabled?: boolean;
  testBypassEnabled?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function readPayload(form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      websiteUrl: String(data.get("websiteUrl") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      businessName: String(data.get("businessName") ?? "").trim(),
      competitorUrl: String(data.get("competitorUrl") ?? "").trim(),
    };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    const payload = readPayload(e.currentTarget);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        issues?: FieldErrors;
      };

      if (!res.ok || !body.url) {
        if (body.issues) setFieldErrors(body.issues);
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

  async function onTestReport() {
    const form = document.getElementById("order-form") as HTMLFormElement | null;
    if (!form) return;
    if (!form.reportValidity()) return;

    setError(null);
    setFieldErrors({});
    setTestSubmitting(true);

    const payload = readPayload(form);

    try {
      const res = await fetch("/api/test-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as {
        redirect?: string;
        error?: string;
        issues?: FieldErrors;
      };

      if (!res.ok || !body.redirect) {
        if (body.issues) setFieldErrors(body.issues);
        setError(body.error ?? "Could not save the test order.");
        setTestSubmitting(false);
        return;
      }

      window.location.href = body.redirect;
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      setTestSubmitting(false);
    }
  }

  return (
    <form id="order-form" onSubmit={onSubmit} className="card space-y-5">
      <Field
        id="websiteUrl"
        label="Website URL"
        required
        defaultValue={defaults?.websiteUrl}
        type="url"
        placeholder="https://yourbusiness.com"
        error={fieldErrors.websiteUrl?.[0]}
      />
      <Field
        id="email"
        label="Email"
        required
        defaultValue={defaults?.email}
        type="email"
        placeholder="you@yourbusiness.com"
        error={fieldErrors.email?.[0]}
        hint="We’ll deliver your audit report to this email."
      />
      <Field
        id="businessName"
        label="Business name"
        type="text"
        placeholder="Acme Roofing (optional)"
        error={fieldErrors.businessName?.[0]}
      />
      <Field
        id="competitorUrl"
        label="Competitor URL"
        type="url"
        placeholder="https://competitor.com (optional)"
        error={fieldErrors.competitorUrl?.[0]}
        hint="Optional — we’ll compare your visibility directly against them."
      />

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
        disabled={submitting || testSubmitting || !checkoutEnabled}
        className="btn-primary w-full justify-center text-base disabled:cursor-not-allowed disabled:opacity-60"
      >
        {!checkoutEnabled
          ? "Checkout not yet configured"
          : submitting
            ? "Redirecting to checkout…"
            : "Continue to Secure Checkout — $97"}
      </button>

      <p className="text-center text-xs text-white/40">
        Secure payment via Stripe. One-time charge of $97 USD. Delivered by
        email within 24 hours, generated using AI-assisted analysis across
        ChatGPT, Claude, Perplexity, and Gemini.
      </p>

      {testBypassEnabled ? (
        <div className="border-t border-dashed border-white/10 pt-5">
          <div className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-amber-200">
            Local development only
          </div>
          <button
            type="button"
            onClick={onTestReport}
            disabled={submitting || testSubmitting}
            className="btn-ghost mt-3 w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {testSubmitting ? "Generating test report…" : "Test Report Locally"}
          </button>
          <p className="mt-2 text-center text-[11px] text-white/40">
            Skips Stripe. Saves a TEST order and opens the report preview using
            your URL and business info.
          </p>
        </div>
      ) : null}
    </form>
  );
}

function Field({
  id,
  label,
  type,
  required,
  defaultValue,
  placeholder,
  error,
  hint,
}: {
  id: string;
  label: string;
  type: "text" | "email" | "url";
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center justify-between text-sm font-medium text-white/85"
      >
        <span>
          {label}
          {required ? <span className="ml-1 text-accent">*</span> : null}
        </span>
        {!required ? (
          <span className="text-xs text-white/40">Optional</span>
        ) : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input-field"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-white/40">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
