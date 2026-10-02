/**
 * Safe public-web fetch for website change tracking.
 *
 * Rules (all enforced here, never by callers):
 *   - http/https only, default ports (80/443) only, no credentials in URLs.
 *   - Every DNS answer is checked against private / loopback / link-local /
 *     CGNAT / multicast / reserved / documentation ranges (IPv4 and IPv6,
 *     including IPv4-mapped and NAT64 forms) — BEFORE the request and again
 *     at connect time inside the socket `lookup`, so DNS rebinding between
 *     the check and the connection can't reach an internal address.
 *   - Redirects are followed manually (max N); each hop is re-validated
 *     and must stay on the same site (`normalizeDomain`) — a cross-site
 *     redirect is recorded, not followed.
 *   - Per-request timeout, response-size cap, content-type check.
 *   - No cookies, no auth, a fixed honest User-Agent. A 401/403 is
 *     recorded as access_denied and never retried with other credentials
 *     or user agents.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

import { normalizeDomain } from "@/lib/business/normalize-domain";

export const SCANNER_USER_AGENT = "GeoVizSiteScanner/1.0 (+https://geoviz.ai)";
export const SCANNER_UA_TOKEN = "geovizsitescanner";

export type FetchFailure =
  | "blocked_unsafe"
  | "redirect_offsite"
  | "access_denied"
  | "not_found"
  | "http_error"
  | "timeout"
  | "network_error"
  | "not_html"
  | "too_large";

export type SafeFetchResult =
  | { ok: true; status: number; finalUrl: string; contentType: string | null; body: string; bytes: number; redirects: string[] }
  | { ok: false; fetchStatus: FetchFailure; httpStatus: number | null; finalUrl: string | null; error: string; bytes: number; redirects: string[] };

export type ResolvedAddress = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

/** Raw single-hop transport (no redirects). Injected in tests. */
export type Transport = (
  url: URL,
  opts: { timeoutMs: number; maxBytes: number; headers: Record<string, string>; resolver: Resolver },
) => Promise<{ status: number; headers: Record<string, string | undefined>; body: Buffer; truncated: boolean }>;

// ── Address classification ─────────────────────────────────────────────
function v4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s)) return null;
    const v = Number(s);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}
const inV4 = (n: number, base: string, bits: number) => {
  const b = v4ToInt(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((n & mask) >>> 0) === ((b & mask) >>> 0);
};
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]!;
  let tail: number[] = [];
  const v4m = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4m) {
    const n = v4ToInt(v4m[1]!);
    if (n === null) return null;
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    s = s.slice(0, s.length - v4m[1]!.length) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && missing !== 0) return null;
  const parts = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((h) => parseInt(h || "0", 16));
  if (parts.length !== 8 || parts.some((x) => Number.isNaN(x) || x < 0 || x > 0xffff)) return null;
  if (tail.length) { parts[6] = tail[0]!; parts[7] = tail[1]!; }
  return parts;
}

/** True for any address a public-web scanner must never connect to. */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip)!;
    return BLOCKED_V4.some(([b, bits]) => inV4(n, b, bits));
  }
  if (net.isIPv6(ip)) {
    const p = expandV6(ip);
    if (!p) return true;
    const allZeroPrefix = p.slice(0, 5).every((x) => x === 0);
    if (p.every((x) => x === 0)) return true; // ::
    if (allZeroPrefix && p[5] === 0 && p[6] === 0 && p[7] === 1) return true; // ::1
    if (allZeroPrefix && p[5] === 0xffff) return isBlockedAddress(`${p[6]! >> 8}.${p[6]! & 255}.${p[7]! >> 8}.${p[7]! & 255}`); // ::ffff:a.b.c.d
    if (p[0] === 0x64 && p[1] === 0xff9b && p.slice(2, 6).every((x) => x === 0)) return isBlockedAddress(`${p[6]! >> 8}.${p[6]! & 255}.${p[7]! >> 8}.${p[7]! & 255}`); // NAT64
    if ((p[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((p[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((p[0]! & 0xff00) === 0xff00) return true; // multicast
    if (p[0] === 0x2001 && p[1] === 0x0db8) return true; // documentation
    if (allZeroPrefix && p[5] === 0) return true; // IPv4-compatible (deprecated)
    return false;
  }
  return true; // not an IP at all → refuse
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Shape checks that need no network. */
export function checkUrlShape(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: `protocol ${url.protocol} not allowed` };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL not allowed" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: `port ${url.port} not allowed` };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isBlockedAddress(host)) return { ok: false, reason: "private or reserved IP address" };
  if (!net.isIP(host)) {
    if (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp|intranet)$/i.test(host) || host === "localhost") {
      return { ok: false, reason: "non-public hostname" };
    }
  }
  return { ok: true, url };
}

export const defaultResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs as ResolvedAddress[]))));

/** Resolve and require EVERY answer to be public. */
export async function assertPublicHost(hostname: string, resolver: Resolver): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new UnsafeTargetError(`${host} is a private or reserved address`);
    return;
  }
  const addrs = await resolver(host);
  if (addrs.length === 0) throw new UnsafeTargetError(`${host} did not resolve`);
  const bad = addrs.find((a) => isBlockedAddress(a.address));
  if (bad) throw new UnsafeTargetError(`${host} resolves to a private or reserved address`);
}

export class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTargetError";
  }
}

/** Socket-level lookup that re-validates at connect time (anti DNS-rebinding). */
export function createSafeLookup(resolver: Resolver) {
  return (hostname: string, _opts: unknown, cb: (err: Error | null, address?: string | dns.LookupAddress[], family?: number) => void) => {
    resolver(hostname)
      .then((addrs) => {
        const bad = addrs.find((a) => isBlockedAddress(a.address));
        if (addrs.length === 0 || bad) return cb(new UnsafeTargetError(`${hostname} resolves to a non-public address`));
        const first = addrs[0]!;
        const o = _opts as { all?: boolean } | undefined;
        if (o?.all) return cb(null, addrs as dns.LookupAddress[]);
        cb(null, first.address, first.family);
      })
      .catch((err) => cb(err));
  };
}

/** Real transport: node:http(s), connect-time address validation, size cap, no keep-alive. */
export const nodeTransport: Transport = (url, { timeoutMs, maxBytes, headers, resolver }) =>
  new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      { method: "GET", headers, lookup: createSafeLookup(resolver) as never, agent: false, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = () => {
          const h: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.headers)) h[k] = Array.isArray(v) ? v.join(", ") : v;
          resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks), truncated });
        };
        res.on("end", done);
        res.on("close", done);
        res.on("error", (e) => (truncated ? done() : reject(e)));
      },
    );
    const killer = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), timeoutMs);
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (e) => {
      clearTimeout(killer);
      reject(e);
    });
    req.on("close", () => clearTimeout(killer));
    req.end();
  });

export type SafeFetchOptions = {
  /** Only follow redirects that stay on this site (normalizeDomain). */
  site: string;
  accept: "html" | "text" | "xml";
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolver?: Resolver;
  transport?: Transport;
};

const ACCEPT_HEADER = { html: "text/html,application/xhtml+xml", text: "text/plain,*/*;q=0.5", xml: "application/xml,text/xml,*/*;q=0.5" };

function failure(fetchStatus: FetchFailure, error: string, extra: { httpStatus?: number | null; finalUrl?: string | null; bytes?: number; redirects: string[] }): SafeFetchResult {
  return { ok: false, fetchStatus, error, httpStatus: extra.httpStatus ?? null, finalUrl: extra.finalUrl ?? null, bytes: extra.bytes ?? 0, redirects: extra.redirects };
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const resolver = opts.resolver ?? defaultResolver;
  const transport = opts.transport ?? nodeTransport;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  const redirects: string[] = [];
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const shape = checkUrlShape(current);
    if (!shape.ok) return failure("blocked_unsafe", shape.reason, { finalUrl: current, redirects });
    if (normalizeDomain(shape.url.toString()) !== opts.site) {
      return failure(hop === 0 ? "blocked_unsafe" : "redirect_offsite", `leaves site ${opts.site}`, { finalUrl: current, redirects });
    }
    try {
      await assertPublicHost(shape.url.hostname, resolver);
    } catch (err) {
      if (err instanceof UnsafeTargetError) return failure("blocked_unsafe", err.message, { finalUrl: current, redirects });
      return failure("network_error", `DNS: ${(err as Error).message}`, { finalUrl: current, redirects });
    }
    let res: Awaited<ReturnType<Transport>>;
    try {
      res = await transport(shape.url, {
        timeoutMs,
        maxBytes,
        resolver,
        headers: { "User-Agent": SCANNER_USER_AGENT, Accept: ACCEPT_HEADER[opts.accept], "Accept-Encoding": "identity" },
      });
    } catch (err) {
      const e = err as { name?: string; code?: string; message?: string };
      if (e.name === "UnsafeTargetError") return failure("blocked_unsafe", e.message ?? "unsafe", { finalUrl: current, redirects });
      if (e.code === "ETIMEDOUT" || /timeout/i.test(e.message ?? "")) return failure("timeout", `no response within ${timeoutMs / 1000}s`, { finalUrl: current, redirects });
      return failure("network_error", (e.message ?? String(err)).slice(0, 200), { finalUrl: current, redirects });
    }

    const bytes = res.body.length;
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      if (hop === maxRedirects) return failure("http_error", "too many redirects", { httpStatus: res.status, finalUrl: current, bytes, redirects });
      const next = new URL(res.headers.location, shape.url).toString();
      redirects.push(next);
      current = next;
      continue;
    }
    if (res.truncated) return failure("too_large", `response exceeded ${maxBytes} bytes`, { httpStatus: res.status, finalUrl: current, bytes, redirects });
    if (res.status === 401 || res.status === 403) return failure("access_denied", `HTTP ${res.status} — access restricted; not bypassed`, { httpStatus: res.status, finalUrl: current, bytes, redirects });
    if (res.status === 404 || res.status === 410) return failure("not_found", `HTTP ${res.status}`, { httpStatus: res.status, finalUrl: current, bytes, redirects });
    if (res.status < 200 || res.status >= 300) return failure("http_error", `HTTP ${res.status}`, { httpStatus: res.status, finalUrl: current, bytes, redirects });

    const contentType = res.headers["content-type"] ?? null;
    if (opts.accept === "html" && contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return failure("not_html", `content-type ${contentType}`, { httpStatus: res.status, finalUrl: current, bytes, redirects });
    }
    return { ok: true, status: res.status, finalUrl: current, contentType, body: res.body.toString("utf8"), bytes, redirects };
  }
  return failure("http_error", "too many redirects", { finalUrl: current, redirects });
}
