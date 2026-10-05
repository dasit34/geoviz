// Page-structure evidence for business-type classification (scoring v1.3).
//
// General, brand-agnostic signals read from the raw homepage HTML that tell a
// publisher / media site or an online store apart from a local service or
// software business. Each signal is a count or a flag; the classifier turns
// them into evidence points (classifyBusinessType.ts). Pure; never throws.

import { JSDOM } from "jsdom";

export type PageSignals = {
  // ── Publisher / media ──
  /** og:type=article or article:* meta tags. */
  ogArticle: boolean;
  /** <link rel="alternate"> RSS / Atom feeds. */
  feedLinks: number;
  /** Internal links with headline-length text (≥ 5 words, ≥ 30 chars) to article-shaped paths. */
  headlineLinks: number;
  /** "By First Last" bylines, or author / byline-marked elements. */
  bylines: number;
  /** <time> elements and "N minutes/hours ago" stamps. */
  dateStamps: number;
  /** Distinct news / section words used as navigation link text. */
  newsNavItems: string[];
  // ── Ecommerce ──
  /** Internal links to product / collection / catalog paths. */
  productLinks: number;
  /** One-time prices ($ / € / £ amounts not followed by a per-month / per-user period). */
  prices: number;
  /** Cart / bag / basket / checkout links or buttons. */
  cartNav: number;
  /** A commerce platform or product metadata (generator meta, platform assets, og:type=product, product:price meta). */
  commercePlatform: string | null;
};

const NEWS_NAV = new Set([
  "news", "local news", "politics", "world", "business", "sports", "entertainment", "opinion",
  "tech", "technology", "science", "health", "culture", "lifestyle", "scores", "standings", "weather", "video",
]);
const ARTICLE_PATH = /\/(news|story|stories|article|articles|blog|posts?)\/|\/(19|20)\d{2}\/\d{1,2}\/|\/id\/\d+|-\d{6,}(?:$|[/?#.])/i;
// A catalog section at the site root ("/products/x", "/collections/x", "/shop/x"),
// or a "products" segment anywhere. A nested "/watch/catalog/x" (a video
// catalog) is not a product link.
const PRODUCT_PATH = /^\/(?:products?|collections?|shop|store|catalog|item)\/[^/?#]+|\/products?\/[^/?#]+/i;
const PLATFORM_GENERATOR = /\b(shopify|woocommerce|bigcommerce|magento|prestashop|opencart|salesforce commerce|squarespace commerce)\b/i;
const PLATFORM_ASSET = [
  [/cdn\.shopify\.com|shopify\.theme|\bShopify\./, "Shopify"],
  [/woocommerce/i, "WooCommerce"],
  [/cdn\d*\.bigcommerce\.com/i, "BigCommerce"],
  [/\bMage\.Cookies|\/static\/version\d+\/frontend\//, "Magento"],
] as const;

const EMPTY: PageSignals = {
  ogArticle: false, feedLinks: 0, headlineLinks: 0, bylines: 0, dateStamps: 0, newsNavItems: [],
  productLinks: 0, prices: 0, cartNav: 0, commercePlatform: null,
};

export function analyzePageSignals(html: string, url: string): PageSignals {
  if (!html) return { ...EMPTY };
  let doc: Document;
  let origin: string;
  try {
    doc = new JSDOM(html, { url }).window.document;
    origin = new URL(url).origin;
  } catch {
    return { ...EMPTY };
  }
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute("content")?.trim() ?? "";

  // Publisher metadata.
  const ogArticle = /^article$/i.test(meta('meta[property="og:type"]')) || doc.querySelector('meta[property^="article:"]') !== null;
  const feedLinks = doc.querySelectorAll('link[rel~="alternate"][type*="rss"], link[rel~="alternate"][type*="atom"]').length;

  // Ecommerce metadata (read before scripts are dropped).
  let commercePlatform: string | null = null;
  const generator = meta('meta[name="generator"]');
  const gen = generator.match(PLATFORM_GENERATOR);
  if (gen) commercePlatform = gen[1]!.replace(/^\w/, (c) => c.toUpperCase());
  if (!commercePlatform) {
    const assets = Array.from(doc.querySelectorAll("script[src], link[href]"))
      .map((e) => e.getAttribute("src") ?? e.getAttribute("href") ?? "")
      .join(" ");
    const inline = html.length > 400_000 ? html.slice(0, 400_000) : html;
    for (const [re, name] of PLATFORM_ASSET) if (re.test(assets) || re.test(inline)) { commercePlatform = name; break; }
  }
  if (!commercePlatform && (/^product$/i.test(meta('meta[property="og:type"]')) || doc.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"]'))) {
    commercePlatform = "product metadata";
  }

  doc.querySelectorAll("script, style, noscript, template").forEach((n) => n.remove());

  // Links.
  let headlineLinks = 0;
  let productLinks = 0;
  let cartNav = 0;
  const navWords = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    let u: URL;
    try {
      u = new URL(href, url);
    } catch {
      continue;
    }
    const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    const internal = u.origin === origin;
    if (/\b(cart|bag|basket|checkout)\b/i.test(u.pathname) || /^(cart|bag|basket|checkout|view cart|your cart)$/i.test(text)) cartNav += 1;
    if (!internal) continue;
    if (PRODUCT_PATH.test(u.pathname)) productLinks += 1;
    if (text.length >= 30 && text.split(" ").length >= 5 && (ARTICLE_PATH.test(u.pathname) || u.pathname.split("/").filter(Boolean).length >= 3)) headlineLinks += 1;
    const t = text.toLowerCase();
    if (NEWS_NAV.has(t) && a.closest("nav, header") !== null) navWords.add(t);
  }
  cartNav += doc.querySelectorAll('button[name="add"], form[action*="/cart"], [class*="add-to-cart"], [class*="addtocart"]').length;

  // Text-level patterns (original case for bylines).
  const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
  const bylineText = (text.match(/\b[Bb]y\s+[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+/g) ?? []).length;
  const bylineEls = doc.querySelectorAll('[rel="author"], [class*="byline"], [itemprop="author"]').length;
  const dateStamps =
    doc.querySelectorAll("time").length +
    (text.match(/\b\d{1,2}\s*(?:minutes?|mins?|hours?|hrs?|h|m)\s+ago\b/gi) ?? []).length;
  // One-time prices only: a full amount not followed by more digits or by a
  // subscription period ("$12/mo", "€9 per user" are software pricing).
  let prices = 0;
  for (const m of text.matchAll(/[$€£]\s?\d{1,5}(?:[.,]\d{2})?/g)) {
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 16);
    if (/^\d/.test(after) || /^\s*(?:\/|per\s)\s*(?:mo|month|user|seat|yr|year)/i.test(after)) continue;
    prices += 1;
  }

  return {
    ogArticle,
    feedLinks,
    headlineLinks,
    bylines: bylineText + bylineEls,
    dateStamps,
    newsNavItems: Array.from(navWords).sort(),
    productLinks,
    prices,
    cartNav,
    commercePlatform,
  };
}
