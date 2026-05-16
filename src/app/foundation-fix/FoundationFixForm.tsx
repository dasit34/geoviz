"use client";

import { useState, type FormEvent } from "react";

type Defaults = {
  businessName?: string;
  websiteUrl?: string;
  contactEmail?: string;
  auditOrderId?: string;
};

type FieldErrors = Partial<
  Record<
    "businessName" | "websiteUrl" | "contactEmail" | "auditOrderId" | "notes",
    string[]
  >
>;

export function FoundationFixForm({ defaults }: { defaults?: Defaults }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    const data = new FormData(e.currentTarget);
    const payload = {
      businessName: String(data.get("businessName") ?? "").trim(),
      websiteUrl: String(data.get("websiteUrl") ?? "").trim(),
      contactEmail: String(data.get("contactEmail") ?? "").trim(),
      auditOrderId: String(data.get("auditOrderId") ?? "").trim(),
      notes: String(data.get("notes") ?? "").trim(),
    };

    try {
      const res = await fetch("/api/foundation-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        issues?: FieldErrors;
      };

      if (!res.ok || !body.ok) {
        if (body.issues) setFieldErrors(body.issues);
        setError(body.error ?? "Could not submit your request. Please try again.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setSubmitting(false);
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="card space-y-3 text-center">
        <h2 className="h3">Request received.</h2>
        <p className="text-sm text-white/75">
          Thanks — we&rsquo;ll review your audit results and reply within
          one business day with a scoped setup plan. If your site needs
          custom scoping, we&rsquo;ll let you know in that reply.
        </p>
        <p className="text-xs text-white/40">
          Check your email (including spam) for our reply.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <Field
        id="businessName"
        label="Business name"
        required
        defaultValue={defaults?.businessName}
        type="text"
        placeholder="Acme Roofing"
        error={fieldErrors.businessName?.[0]}
      />
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
        id="contactEmail"
        label="Contact email"
        required
        defaultValue={defaults?.contactEmail}
        type="email"
        placeholder="you@yourbusiness.com"
        error={fieldErrors.contactEmail?.[0]}
        hint="We'll reply here within one business day."
      />
      <Field
        id="auditOrderId"
        label="Audit / report ID"
        type="text"
        placeholder="Optional — e.g. cmxxxxxxx"
        defaultValue={defaults?.auditOrderId}
        error={fieldErrors.auditOrderId?.[0]}
        hint="If you already have a GeoViz audit, paste your report ID."
      />
      <TextAreaField
        id="notes"
        label="Notes"
        placeholder="Anything specific you want us to address?"
        error={fieldErrors.notes?.[0]}
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
        disabled={submitting}
        className="btn-primary w-full justify-center text-base disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending request…" : "Send my Foundation Fix request"}
      </button>

      <p className="text-center text-xs text-white/40">
        $497 one-time. 3–5 business days. Complex sites may require
        custom scoping.
      </p>
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
        {!required ? <span className="text-xs text-white/40">Optional</span> : null}
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

function TextAreaField({
  id,
  label,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center justify-between text-sm font-medium text-white/85"
      >
        <span>{label}</span>
        <span className="text-xs text-white/40">Optional</span>
      </label>
      <textarea
        id={id}
        name={id}
        rows={4}
        maxLength={1000}
        placeholder={placeholder}
        className="input-field"
        aria-invalid={Boolean(error) || undefined}
      />
      {error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
