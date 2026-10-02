/**
 * In-memory website fakes for website-tracking tests — no network.
 * `fakeSite` serves canned responses per URL path through the scanner's
 * Fetcher interface; `html` builds a small page.
 */
import { normalizeDomain } from "../../src/lib/business/normalize-domain";
import type { Fetcher } from "../../src/lib/monitoring/website/scanner";
import type { SafeFetchResult } from "../../src/lib/monitoring/website/safe-fetch";

export type FakeRoute = { status: number; body?: string; contentType?: string } | "timeout" | "network";

export function fakeSite(routes: Record<string, FakeRoute>) {
  const requested: string[] = [];
  const fetcher: Fetcher = async (url, opts) => {
    requested.push(url);
    const u = new URL(url);
    if (normalizeDomain(url) !== opts.site) {
      return { ok: false, fetchStatus: "blocked_unsafe", httpStatus: null, finalUrl: url, error: "off site", bytes: 0, redirects: [] };
    }
    const r = routes[u.pathname] ?? { status: 404, body: "not found" };
    if (r === "timeout") return { ok: false, fetchStatus: "timeout", httpStatus: null, finalUrl: url, error: "timeout", bytes: 0, redirects: [] };
    if (r === "network") return { ok: false, fetchStatus: "network_error", httpStatus: null, finalUrl: url, error: "ECONNRESET", bytes: 0, redirects: [] };
    const body = r.body ?? "";
    const bytes = Buffer.byteLength(body);
    const fail = (fetchStatus: Extract<SafeFetchResult, { ok: false }>["fetchStatus"]): SafeFetchResult => ({ ok: false, fetchStatus, httpStatus: r.status, finalUrl: url, error: `HTTP ${r.status}`, bytes, redirects: [] });
    if (r.status === 401 || r.status === 403) return fail("access_denied");
    if (r.status === 404 || r.status === 410) return fail("not_found");
    if (r.status < 200 || r.status >= 300) return fail("http_error");
    return { ok: true, status: r.status, finalUrl: url, contentType: r.contentType ?? "text/html", body, bytes, redirects: [] };
  };
  return { fetcher, requested };
}

export function html(args: {
  title: string;
  description?: string;
  h1?: string;
  h2?: string[];
  paragraphs?: string[];
  nav?: Array<[string, string]>;
  footer?: string;
  jsonLd?: unknown;
}): string {
  const nav = (args.nav ?? []).map(([href, text]) => `<a href="${href}">${text}</a>`).join(" ");
  return `<!doctype html><html><head><title>${args.title}</title>
${args.description ? `<meta name="description" content="${args.description}">` : ""}
${args.jsonLd ? `<script type="application/ld+json">${JSON.stringify(args.jsonLd)}</script>` : ""}
</head><body>
<header><nav>${nav}</nav></header>
<main>
${args.h1 ? `<h1>${args.h1}</h1>` : ""}
${(args.h2 ?? []).map((h) => `<h2>${h}</h2>`).join("\n")}
${(args.paragraphs ?? []).map((p) => `<p>${p}</p>`).join("\n")}
</main>
<footer>${args.footer ?? ""}</footer>
</body></html>`;
}

export const noSleep = { sleep: async () => {}, now: () => new Date("2026-10-02T12:00:00Z") };
