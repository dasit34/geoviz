"use client";

import { useState } from "react";

/**
 * Minimal copy-to-clipboard button used by the admin trace page.
 *
 * Kept as a tiny client island so the trace route can otherwise stay
 * a server component (Prisma direct, no fetch boundaries). The text
 * to copy is passed in via prop — we never mount or hydrate the raw
 * JSON `<pre>` itself, so the larger payload stays on the server.
 */
export function CopyJsonButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function handleClick() {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(text);
        setState("copied");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 1400);
  }

  const display =
    state === "copied"
      ? "Copied"
      : state === "error"
        ? "Copy unavailable"
        : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/75 hover:border-white/25 hover:text-white"
    >
      {display}
    </button>
  );
}
