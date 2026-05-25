import Link from "next/link";

/**
 * Footer — landing-page footer (Phase I, Claude Design handoff).
 *
 * Big Instrument Serif "GeoViz.AI" wordmark + three columns
 * (brand+tag, Product, Company). Bottom row carries copyright +
 * contact email. Sits over the global PageAtmosphere via a soft
 * downward radial glow.
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
            <h2
              style={{
                fontFamily: "var(--font-instrument), serif",
                fontSize: "clamp(60px, 7vw, 88px)",
                letterSpacing: "-0.03em",
                lineHeight: 0.9,
                margin: 0,
                color: "var(--ink)",
              }}
            >
              GeoViz
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: "16px",
                  color: "var(--ink-low)",
                  letterSpacing: "0.18em",
                  marginLeft: 8,
                  verticalAlign: "middle",
                }}
              >
                .AI
              </span>
            </h2>
            <p
              className="mt-4"
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
