/**
 * robots.txt handling per RFC 9309 (pure parser + fetch policy).
 *
 * - Uses the most specific group matching our token ("geovizsitescanner"),
 *   else the "*" group.
 * - Allow/Disallow with `*` and `$` wildcards; the longest matching rule
 *   wins; ties go to Allow. Empty Disallow allows everything.
 * - Fetch outcome policy (RFC 9309 §2.3.1): robots.txt 4xx → no
 *   restrictions; 5xx / network error / timeout → treat the whole site as
 *   disallowed for this scan (we never guess our way past an unreachable
 *   robots.txt).
 */
import { SCANNER_UA_TOKEN } from "./safe-fetch";

export type RobotsRules = {
  rules: Array<{ allow: boolean; pattern: string }>;
  crawlDelaySec: number | null;
  sitemaps: string[];
};

export type RobotsPolicy =
  | { kind: "rules"; robots: RobotsRules }
  | { kind: "allow_all"; reason: string; sitemaps: string[] }
  | { kind: "disallow_all"; reason: string };

export function parseRobots(text: string, uaToken: string = SCANNER_UA_TOKEN): RobotsRules {
  type Group = { agents: string[]; rules: RobotsRules["rules"]; crawlDelay: number | null };
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      if (key === "disallow" && value === "") continue; // empty disallow = allow all
      current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }

  const token = uaToken.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelaySec: chosen.map((g) => g.crawlDelay).find((d) => d !== null) ?? null,
    sitemaps,
  };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Path + query of a URL, as robots rules match against. */
export function robotsPath(url: string): string {
  const u = new URL(url);
  return `${u.pathname || "/"}${u.search}`;
}

export function isAllowed(robots: RobotsRules, url: string): boolean {
  const path = robotsPath(url);
  let best: { allow: boolean; len: number } | null = null;
  for (const r of robots.rules) {
    if (!r.pattern) continue;
    if (!patternToRegex(r.pattern).test(path)) continue;
    const len = r.pattern.replace(/\*/g, "").length;
    if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/** Map a robots.txt fetch outcome to a scan policy. */
export function robotsPolicyFrom(fetch: { ok: true; body: string } | { ok: false; fetchStatus: string; httpStatus: number | null }): RobotsPolicy {
  if (fetch.ok) {
    const robots = parseRobots(fetch.body);
    return { kind: "rules", robots };
  }
  if (fetch.fetchStatus === "not_found" || fetch.fetchStatus === "access_denied" || (fetch.httpStatus !== null && fetch.httpStatus >= 400 && fetch.httpStatus < 500)) {
    return { kind: "allow_all", reason: `robots.txt unavailable (HTTP ${fetch.httpStatus ?? "4xx"}) — no restrictions per RFC 9309`, sitemaps: [] };
  }
  return { kind: "disallow_all", reason: `robots.txt could not be fetched (${fetch.fetchStatus}) — site not scanned this time` };
}

export function crawlDelayMs(policy: RobotsPolicy, minMs = 500, capMs = 5_000): number {
  const d = policy.kind === "rules" && policy.robots.crawlDelaySec !== null ? policy.robots.crawlDelaySec * 1000 : 0;
  return Math.min(capMs, Math.max(minMs, d));
}
