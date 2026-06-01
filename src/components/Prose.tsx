import ReactMarkdown from "react-markdown";

import { swapTechnicalTerms } from "@/lib/parse-report";

/**
 * Unified markdown renderers for the GeoViz audit report.
 *
 * Why this exists: AI-generated audit markdown was being rendered
 * inconsistently across the report — some sections used
 * <ReactMarkdown>, others injected raw {string} into <p> / <dd> /
 * <span> elements, which left literal `**bold**`, flattened bullets,
 * and collapsed spacing visible to the customer. This component is
 * the single source of truth for any AI-text injection point so the
 * report reads as a structured deliverable, not pasted ChatGPT.
 *
 * Two variants:
 *
 *   <Prose>{md}</Prose>        — full block-level rendering. Wraps in
 *                                a div with `report-prose` class so
 *                                print.css typography (paragraphs,
 *                                headings, lists, code, blockquotes,
 *                                links) applies consistently.
 *
 *   <InlineProse>{md}</InlineProse> — for places where markdown sits
 *                                inside a `<dd>`, `<span>`, or other
 *                                non-block parent. Renders bold /
 *                                italic / code / links / line breaks
 *                                but maps `p` → fragment so we don't
 *                                inject block-level wrappers and break
 *                                the surrounding layout.
 *
 * Safety: react-markdown by default does NOT render raw HTML — any
 * `<script>` or other tag the model emits is escaped. We rely on
 * that default and don't override it.
 */
export function Prose({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  // Report Polish P7 — render-layer safety net runs every customer-
  // facing markdown block through swapTechnicalTerms() so jargon
  // ("schema markup", "JSON-LD", "crawler" etc.) is replaced with
  // plain English before display. Primary defense is the worker
  // prompt; this catches anything that slips through.
  const cleaned = swapTechnicalTerms(children);
  return (
    <div
      className={
        className ? `report-prose ${className}` : "report-prose"
      }
    >
      <ReactMarkdown>{cleaned}</ReactMarkdown>
    </div>
  );
}

const INLINE_COMPONENTS = {
  // Block-to-inline mappings. The model occasionally emits paragraphs
  // or list-like fragments inside what should be inline content (e.g.
  // a single `<dd>` slot). Mapping them to fragments / spans keeps the
  // surrounding layout intact while preserving the intended emphasis.
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <span className="report-inline-list">{children}</span>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <span className="report-inline-list">{children}</span>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <span className="report-inline-list-item"> · {children}</span>
  ),
} as const;

export function InlineProse({ children }: { children: string }) {
  const cleaned = swapTechnicalTerms(children);
  return (
    <ReactMarkdown components={INLINE_COMPONENTS}>{cleaned}</ReactMarkdown>
  );
}
