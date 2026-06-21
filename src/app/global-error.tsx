"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary. `src/app/error.tsx` catches throws BELOW
 * the root layout; this file is the last-resort net for a throw in the
 * root layout itself. Next.js mounts it in place of the entire document,
 * so it must render its own <html>/<body> and CANNOT use Header/Footer,
 * the `@/` layout, or Tailwind classes from globals.css (that stylesheet
 * is imported by the layout that just failed). Inline styles are the
 * deliberate, guaranteed-readable choice for this one special file — the
 * goal is "never a blank white screen," even when the layout is broken.
 *
 * Shows a digest reference only — never the error message, stack trace,
 * business name, order ID, report markdown, or score.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      `[error-boundary] uncaught root render error digest=${error.digest ?? "unknown"}`,
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05070d",
          color: "#e2e8f0",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <p
            style={{
              display: "inline-block",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#ff7a18",
              border: "1px solid rgba(255,122,24,0.3)",
              borderRadius: "999px",
              padding: "4px 12px",
              margin: 0,
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 600,
              margin: "20px 0 0",
              lineHeight: 1.25,
            }}
          >
            We hit a snag loading GeoViz.
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: "14px 0 0" }}>
            Try again in a moment. If this keeps happening, email us at{" "}
            <a href="mailto:support@geoviz.ai" style={{ color: "#ff7a18" }}>
              support@geoviz.ai
            </a>{" "}
            — we&rsquo;ll fix it fast.
          </p>
          <div
            style={{
              marginTop: "28px",
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#ff7a18",
                color: "#05070d",
                border: "none",
                borderRadius: "8px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "1px solid rgba(226,232,240,0.2)",
                color: "#e2e8f0",
                borderRadius: "8px",
                padding: "10px 18px",
                fontSize: "14px",
                textDecoration: "none",
              }}
            >
              Homepage
            </a>
          </div>
          {error.digest ? (
            <p
              style={{
                marginTop: "24px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "10px",
                color: "rgba(226,232,240,0.4)",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
