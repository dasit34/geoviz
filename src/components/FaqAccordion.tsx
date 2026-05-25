"use client";

import { useState } from "react";

/**
 * FaqAccordion — client component for the landing-page FAQ.
 * Single-source-of-truth for which item is open. Mirrors the
 * design's plus-rotates-to-x toggle.
 */
export type FaqItem = { q: string; a: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number>(0);
  return (
    <div className="flex flex-col">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(isOpen ? -1 : i)}
            className="text-left"
            style={{
              borderTop: "1px solid var(--rule-soft)",
              borderBottom:
                i === items.length - 1 ? "1px solid var(--rule-soft)" : "none",
              padding: "24px 0",
              cursor: "pointer",
              background: "transparent",
              fontFamily: "inherit",
              color: "inherit",
              width: "100%",
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div
                style={{
                  fontFamily: "var(--font-instrument), serif",
                  fontSize: "22px",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                  color: "var(--ink)",
                }}
              >
                {f.q}
              </div>
              <div
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  border: `1px solid ${isOpen ? "var(--ink)" : "var(--rule)"}`,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 14,
                  color: "var(--ink-dim)",
                  flexShrink: 0,
                  transition: "transform 0.25s ease, border-color 0.25s ease",
                  transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                }}
              >
                +
              </div>
            </div>
            <div
              style={{
                maxHeight: isOpen ? 320 : 0,
                overflow: "hidden",
                transition: "max-height 0.32s ease",
              }}
            >
              <div
                style={{
                  paddingTop: 16,
                  fontFamily: "var(--font-geist), system-ui, sans-serif",
                  fontSize: "14.5px",
                  lineHeight: 1.6,
                  color: "var(--ink-dim)",
                  maxWidth: "60ch",
                }}
              >
                {f.a}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
