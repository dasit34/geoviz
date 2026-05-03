import * as cheerio from "cheerio";
import type { RawAuditJson } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; GeoVizBot/0.1; +https://geoviz.local) Chrome/124";

const SECURITY_HEADER_KEYS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

export type CrawlOptions = {
  timeoutMs?: number;
  businessName?: string;
};

export async function crawlPage(
  url: string,
  options: CrawlOptions = {},
): Promise<RawAuditJson> {
  const errors: string[] = [];
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 20_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (err) {
    clearTimeout(timer);
    return {
      url,
      businessName: options.businessName,
      errors: [
        `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
  clearTimeout(timer);

  const securityHeaders: RawAuditJson["security_headers"] = {};
  for (const key of SECURITY_HEADER_KEYS) {
    securityHeaders[key] = response.headers.get(key);
  }

  if (!response.ok) {
    errors.push(`HTTP ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $("head > title").first().text().trim() || null;

  const meta: RawAuditJson["meta"] = {};
  meta.description =
    $('meta[name="description"]').attr("content")?.trim() || null;
  meta.robots = $('meta[name="robots"]').attr("content")?.trim() || null;
  meta.viewport = $('meta[name="viewport"]').attr("content")?.trim() || null;

  const collectHeading = (selector: string) =>
    $(selector)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0);

  const h1 = collectHeading("h1");
  const h2 = collectHeading("h2");
  const h3 = collectHeading("h3");

  let host = "";
  try {
    host = new URL(response.url || url).hostname;
  } catch {
    host = "";
  }

  const links: RawAuditJson["links"] = $("a[href]")
    .map((_, el) => {
      const href = ($(el).attr("href") ?? "").trim();
      const text = $(el).text().trim();
      let type: "internal" | "external" = "external";
      if (href.startsWith("/") || href.startsWith("#") || href === "") {
        type = "internal";
      } else {
        try {
          if (host && new URL(href, response.url || url).hostname === host) {
            type = "internal";
          }
        } catch {
          type = "external";
        }
      }
      return { href, text, type };
    })
    .get();

  const images: RawAuditJson["images"] = $("img")
    .map((_, el) => {
      const src = ($(el).attr("src") ?? "").trim();
      const altAttr = $(el).attr("alt");
      const alt = typeof altAttr === "string" ? altAttr : null;
      return { src, alt };
    })
    .get();

  const structuredData: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) structuredData.push(...parsed);
      else structuredData.push(parsed);
    } catch (err) {
      errors.push(
        `invalid JSON-LD block: ${err instanceof Error ? err.message : "parse error"}`,
      );
    }
  });

  $("script, style, noscript, template").remove();
  const textContent = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = textContent ? textContent.split(/\s+/).length : 0;
  const hasSsrContent = wordCount >= 50;

  return {
    url: response.url || url,
    businessName: options.businessName,
    title,
    meta,
    h1,
    h2,
    h3,
    word_count: wordCount,
    links,
    images,
    structured_data: structuredData,
    security_headers: securityHeaders,
    text_content: textContent.slice(0, 6000),
    has_ssr_content: hasSsrContent,
    errors,
  };
}
