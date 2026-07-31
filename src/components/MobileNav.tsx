"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const MOBILE_NAV_ITEMS: { label: string; href: string; badge?: string }[] = [
  { label: "Free AI Visibility Check", href: "/check", badge: "Free" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Sample report", href: "/sample-report" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

/**
 * Mobile-only header nav: hamburger + free-check CTA + slide-down panel.
 * Split out from Header.tsx (a server component) since this needs client
 * state — mirrors the RevealOnView client-island pattern used elsewhere.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="flex items-center gap-2 lg:hidden">
      <Link
        href="/check"
        className="btn-primary px-4 py-2.5 text-sm"
        onClick={() => setOpen(false)}
      >
        Free Check
      </Link>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.02] text-white/80 transition hover:border-white/25 hover:bg-white/[0.05]"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          {open ? (
            <path d="M5 5 L19 19 M19 5 L5 19" />
          ) : (
            <path d="M4 7 H20 M4 12 H20 M4 17 H20" />
          )}
        </svg>
      </button>

      {open ? (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-20 z-20 bg-ink-950/70 backdrop-blur-sm"
          />
          <div
            id="mobile-nav-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="fixed inset-x-0 top-20 z-30 max-h-[calc(100vh-5rem)] overflow-y-auto border-b border-white/10 bg-ink-950 shadow-card"
          >
            <nav className="container-page flex flex-col gap-1 py-4">
              {MOBILE_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-3 text-base text-white/85 transition hover:bg-white/[0.04] hover:text-white"
                >
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="pill border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
            <div className="container-page flex flex-col gap-3 border-t border-white/10 py-5">
              <Link
                href="/check"
                onClick={() => setOpen(false)}
                className="btn-primary w-full justify-center text-base"
              >
                Start your free check
              </Link>
              <Link
                href="/order"
                onClick={() => setOpen(false)}
                className="text-center text-sm font-medium text-white/55 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Or run the full $97 audit →
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
