"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FreeCheckResults } from "./FreeCheckResults";
import type { CheckResult } from "@/lib/free-check/types";

type FieldErrors = Partial<
  Record<
    "websiteUrl" | "businessName" | "city" | "state" | "category" | "email",
    string[]
  >
>;

type ApiResult = {
  ok: true;
  overallScore: number;
  checks: CheckResult[];
  strengths: string[];
  problems: string[];
  fixes: string[];
};

const CATEGORIES = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "General Contractor",
  "Legal Services",
  "Dental",
  "Medical / Med Spa",
  "Real Estate",
  "Other",
];

const LOADING_STAGES = [
  "Fetching your homepage…",
  "Checking structured data…",
  "Checking crawlability…",
  "Checking contact consistency…",
  "Calculating your AI Visibility Snapshot Score…",
];

type Stage = "idle" | "loading" | "results" | "error";

export function FreeCheckForm() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loadingStageIdx, setLoadingStageIdx] = useState(0);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [submittedInput, setSubmittedInput] = useState<{
    websiteUrl: string;
    businessName: string;
    email: string;
  } | null>(null);
  const [categorySelect, setCategorySelect] = useState("Roofing");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (stage !== "loading") return;
    const t = setInterval(() => {
      setLoadingStageIdx((i) => Math.min(i + 1, LOADING_STAGES.length - 1));
    }, 1100);
    return () => clearInterval(t);
  }, [stage]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = e.currentTarget;
    const data = new FormData(form);
    const category =
      String(data.get("category") ?? "") === "Other"
        ? String(data.get("categoryOther") ?? "").trim()
        : String(data.get("category") ?? "").trim();

    const payload = {
      websiteUrl: String(data.get("websiteUrl") ?? "").trim(),
      businessName: String(data.get("businessName") ?? "").trim(),
      city: String(data.get("city") ?? "").trim(),
      state: String(data.get("state") ?? "").trim(),
      category,
      email: String(data.get("email") ?? "").trim(),
      website2: String(data.get("website2") ?? ""), // honeypot
    };

    setStage("loading");
    setLoadingStageIdx(0);

    try {
      const res = await fetch("/api/free-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as
        | ApiResult
        | { error?: string; issues?: FieldErrors };

      if (!res.ok || !("ok" in body) || !body.ok) {
        const errBody = body as { error?: string; issues?: FieldErrors };
        if (errBody.issues) setFieldErrors(errBody.issues);
        setError(
          errBody.error ??
            "We couldn't complete your check right now. Please try again.",
        );
        setStage("error");
        return;
      }

      setResult(body);
      setSubmittedInput({
        websiteUrl: payload.websiteUrl,
        businessName: payload.businessName,
        email: payload.email,
      });
      setStage("results");
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      setStage("error");
    }
  }

  if (stage === "results" && result && submittedInput) {
    return <FreeCheckResults result={result} input={submittedInput} />;
  }

  return (
    <div className="card space-y-6">
      {stage === "loading" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-4 py-10 text-center"
        >
          <span
            className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent"
            aria-hidden
          />
          <p className="text-sm font-medium text-white/85">
            {LOADING_STAGES[loadingStageIdx]}
          </p>
          <p className="text-xs text-white/40">
            This usually takes a few seconds.
          </p>
        </div>
      ) : (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
          <Field
            id="websiteUrl"
            label="Website URL"
            type="url"
            required
            placeholder="https://yourbusiness.com"
            error={fieldErrors.websiteUrl?.[0]}
          />
          <Field
            id="businessName"
            label="Business name"
            type="text"
            required
            placeholder="Acme Roofing"
            error={fieldErrors.businessName?.[0]}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="city"
              label="City"
              type="text"
              required
              placeholder="Phoenix"
              error={fieldErrors.city?.[0]}
            />
            <Field
              id="state"
              label="State"
              type="text"
              required
              placeholder="AZ"
              error={fieldErrors.state?.[0]}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="category"
              className="text-sm font-medium text-white/85"
            >
              Business category<span className="ml-1 text-accent">*</span>
            </label>
            <select
              id="category"
              name="category"
              required
              value={categorySelect}
              onChange={(e) => setCategorySelect(e.target.value)}
              className="input-field"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {categorySelect === "Other" ? (
              <input
                id="categoryOther"
                name="categoryOther"
                type="text"
                required
                placeholder="Describe your business category"
                className="input-field mt-2"
              />
            ) : null}
            {fieldErrors.category?.[0] ? (
              <p className="text-xs text-red-300">{fieldErrors.category[0]}</p>
            ) : null}
          </div>

          <Field
            id="email"
            label="Email"
            type="email"
            required
            placeholder="you@yourbusiness.com"
            hint="We'll send your results here too."
            error={fieldErrors.email?.[0]}
          />

          {/* Honeypot — hidden from real visitors, only bots fill it. */}
          <div className="hp-field" aria-hidden="true">
            <label htmlFor="website2">Leave this field blank</label>
            <input
              id="website2"
              name="website2"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {stage === "error" && error ? (
            <div
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-primary w-full justify-center text-base"
          >
            Run Free Check
          </button>

          <p className="text-center text-xs text-white/40">
            No account required. Takes about 10 seconds.
          </p>
        </form>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  type,
  required,
  placeholder,
  error,
  hint,
}: {
  id: string;
  label: string;
  type: "text" | "email" | "url";
  required?: boolean;
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-white/85">
        {label}
        {required ? <span className="ml-1 text-accent">*</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
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
