import Link from "next/link";

import { GeoVizMark } from "@/components/brand/GeoVizMark";

/**
 * Footer — landing-page footer.
 *
 * Brand System v2 lockup (constellation mark + "GeoViz.ai" in the display
 * face) + three columns (brand+tag, Product, Company). Bottom row carries
 * copyright + contact email. Sits over a soft downward radial glow.
 */

const PRODUCT = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/sample-report", label: "Sample report" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

const COMPANY = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund-policy", label: "Refund policy" },
  { href: "mailto:support@geoviz.ai", label: "Contact" },
];

export function Footer() {
  return (
    <footer
      className="relative overflow-hidden"
      style={{
        borderTop: "1px solid var(--rule-soft)",
        padding: "100px 0 40px",
        background:
          "linear-gradient(180deg, transparent 0%, oklch(0.085 0.012 250 / 0.28) 50%, oklch(0.085 0.012 250 / 0.40) 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 100%, oklch(0.22 0.05 235 / 0.45), transparent 70%)",
        }}
      />
      <div className="container-shell relative">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-3">
              <GeoVizMark size={52} />
              <span
                className="font-gv-display"
                style={{
                  fontSize: "clamp(40px, 5vw, 60px)",
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  lineHeight: 0.95,
                  color: "var(--ink)",
                }}
              >
                GeoViz<span style={{ color: "var(--gv-signal)" }}>.ai</span>
              </span>
            </span>
            <p
              className="mt-5"
              style={{
                fontFamily: "var(--font-geist), system-ui, sans-serif",
                fontSize: "14.5px",
                color: "var(--ink-dim)",
                maxWidth: "28ch",
                lineHeight: 1.5,
              }}
            >
              AI visibility intelligence — see how AI systems understand your business.
            </p>
          </div>

          <FooterColumn title="Product" items={PRODUCT} />
          <FooterColumn title="Company" items={COMPANY} />
          <div />
        </div>

        <div
          className="mt-20 flex flex-wrap items-center justify-between gap-3"
          style={{
            paddingTop: 24,
            borderTop: "1px solid var(--rule-soft)",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "10.5px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          <span>© {new Date().getFullYear()} GeoViz</span>
          <span>support@geoviz.ai</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string }[];
}) {
  return (
    <div>
      <div
        className="mb-4"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--ink-low)",
        }}
      >
        {title}
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="transition-colors hover:text-[var(--ink)]"
            style={{
              fontFamily: "var(--font-geist), system-ui, sans-serif",
              color: "var(--ink-dim)",
              fontSize: "14px",
              textDecoration: "none",
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
