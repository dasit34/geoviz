// Strip navigation, footer, cookie banners, ads, scripts, layout
// noise — return clean readable page text only. Uses JSDOM +
// Mozilla Readability (the same engine that powers Firefox Reader
// View). Falls back to a bare <body> text extraction when Readability
// can't make sense of the page (single-page apps, atypical structure,
// non-article content).
//
// Never throws — every code path returns a `ReadableContentResult`
// so the preflight orchestrator can fold the result into its
// consolidated output even on degenerate input.
//
// Purpose for V2: improve signal quality for downstream content-depth
// analysis, give the AuditIntelligence layer a clean text snapshot
// for word-count / readability / entity-extraction work that's
// independent of whatever the audit prompt happens to pull.

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ReadableContentResult } from "./types";

const PREVIEW_CHARS = 280;

export function extractReadableContent(
  html: string,
  url: string,
): ReadableContentResult {
  if (!html || html.length === 0) {
    return emptyResult();
  }

  // First-pass: Readability.
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article && article.textContent && article.textContent.trim().length > 0) {
      const text = collapseWhitespace(article.textContent);
      return {
        textLength: text.length,
        parsedByReadability: true,
        fallbackUsed: false,
        articleTitle: article.title ?? null,
        wordCount: countWords(text),
        preview: text.slice(0, PREVIEW_CHARS),
      };
    }
  } catch (err) {
    // Fall through to the body-text fallback.
    void err;
  }

  // Fallback: bare <body> text. JSDOM can still build a DOM even when
  // Readability bails — strip scripts/styles/noscript and harvest the
  // visible text.
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    doc.querySelectorAll("script, style, noscript").forEach((n) => n.remove());
    const body = doc.body;
    const raw = body ? body.textContent ?? "" : "";
    const text = collapseWhitespace(raw);
    return {
      textLength: text.length,
      parsedByReadability: false,
      fallbackUsed: true,
      articleTitle: doc.title ? doc.title.trim() : null,
      wordCount: countWords(text),
      preview: text.slice(0, PREVIEW_CHARS),
    };
  } catch {
    return emptyResult();
  }
}

function emptyResult(): ReadableContentResult {
  return {
    textLength: 0,
    parsedByReadability: false,
    fallbackUsed: true,
    articleTitle: null,
    wordCount: 0,
    preview: "",
  };
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}
