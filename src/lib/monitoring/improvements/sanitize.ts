/**
 * Untrusted-input handling for improvement drafts (pure).
 *
 * Fetched website content and customer-typed text are DATA, never markup
 * or instructions. They are reduced to plain text before use, and JSON-LD
 * is serialized with `<` escaped so a value can never close a <script>.
 */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

export function untrustedText(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  const t = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;|&gt;|&#x?[0-9a-f]+;/gi, " ")
    .replace(CONTROL, "")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** JSON-LD text safe to paste inside <script type="application/ld+json">. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** A same-site http(s) URL, or null. */
export function sameSiteUrl(raw: string, siteDomain: string | null): string | null {
  if (!siteDomain) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || (u.port && u.port !== "80" && u.port !== "443")) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== siteDomain) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}
