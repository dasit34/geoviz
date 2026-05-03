"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function HeroForm() {
  const router = useRouter();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (websiteUrl) params.set("websiteUrl", websiteUrl);
    if (email) params.set("email", email);
    const qs = params.toString();
    router.push(qs ? `/order?${qs}` : "/order");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mt-10 flex flex-col gap-3 sm:flex-row sm:items-stretch"
    >
      <div className="flex-1">
        <label htmlFor="hero-url" className="sr-only">
          Website URL
        </label>
        <input
          id="hero-url"
          name="websiteUrl"
          type="url"
          required
          inputMode="url"
          placeholder="https://yourbusiness.com"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          className="input-field"
        />
      </div>
      <div className="flex-1">
        <label htmlFor="hero-email" className="sr-only">
          Email address
        </label>
        <input
          id="hero-email"
          name="email"
          type="email"
          required
          placeholder="you@yourbusiness.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
        />
      </div>
      <button type="submit" className="btn-primary whitespace-nowrap">
        Run My AI Visibility Audit
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 10h12" />
          <path d="m12 5 5 5-5 5" />
        </svg>
      </button>
    </form>
  );
}
