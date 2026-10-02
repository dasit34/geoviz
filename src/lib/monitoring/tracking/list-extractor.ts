/**
 * Deterministic recommendation-list extraction (pure).
 *
 * Position is reported ONLY when an answer contains a clear ordered
 * recommendation list: numbered items (`1.` / `1)` / `### 1. Name`),
 * at least two of them, numbered 1, 2, 3… in sequence. Bullet lists and
 * bold names still yield the businesses an answer named (for competitor
 * detection) but never a rank — the order businesses happen to appear in
 * prose is not a recommendation order.
 *
 * Staging finding that motivated this (2026-10-02): with web search on,
 * OpenAI and Gemini ignored a "reply only with JSON" contract and wrote
 * markdown prose; none of 8 answers used a numbered list.
 */
export const EXTRACTOR_VERSION = "extractor@1.0.0";

export type ExtractedList = {
  /** Businesses the answer named, in order of appearance (deduped). */
  namedBusinesses: string[];
  /** Names from a clear numbered list, in list order; null when there is none. */
  orderedList: string[] | null;
};

const NUMBERED = /^\s{0,3}(?:#{1,6}\s*)?(\d{1,2})[.)]\s+(.+)$/;
const BULLET = /^\s{0,6}[-*•]\s+(.+)$/;
const MAX_NAME = 80;

function stripLinks(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/** Business name from one list item: bold text, else link text, else text before a separator. */
export function nameFromItem(raw: string): string | null {
  const bold = raw.match(/\*\*(.+?)\*\*/) ?? raw.match(/__(.+?)__/);
  let name = bold ? bold[1]! : null;
  if (!name) {
    const link = raw.match(/\[([^\]]+)\]\([^)]*\)/);
    name = link ? link[1]! : null;
  }
  if (!name) {
    name = stripLinks(raw).split(/\s[–—-]\s|:\s|\s\(|,\s/)[0] ?? "";
  }
  name = stripLinks(name).replace(/[*_`#]/g, "").replace(/[:.\s]+$/, "").replace(/^\s*\d+[.)]\s*/, "").trim();
  if (name.length < 2 || name.length > MAX_NAME) return null;
  // A sentence, not a name.
  if (name.split(/\s+/).length > 9) return null;
  return name;
}

const SINGLE_WORD_NOT_NAMES = /^(best|top|important|note|tip|tips|pros|cons|cost|price|pricing|summary|recommendation|recommended|warning|why|how|what|when|emergency|overall)$/i;

/**
 * Bold text in prose counts as a business name only if it reads like one:
 * starts with a capital/digit, ≤6 words, Title Case (every word longer than
 * three letters capitalized — "Best Air" yes, "Best overall" / "best-rated
 * HVAC companies" no), and isn't a lone heading word like "Important".
 */
export function looksLikeBusinessName(n: string): boolean {
  if (!/^[A-Z0-9]/.test(n)) return false;
  const words = n.split(/\s+/);
  if (words.length > 6) return false;
  if (/[?!]$/.test(n)) return false;
  if (words.length === 1 && SINGLE_WORD_NOT_NAMES.test(n)) return false;
  return words.every((w) => w.length <= 3 || /^[A-Z0-9&(]/.test(w));
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = n.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export function extractRecommendationList(answerText: string): ExtractedList {
  const lines = answerText.split(/\r?\n/);

  // Longest run of consecutive numbered items 1..n (other lines may sit between items).
  let best: string[] = [];
  let run: string[] = [];
  let expected = 1;
  for (const line of lines) {
    const m = line.match(NUMBERED);
    if (!m) continue;
    const n = Number(m[1]);
    if (n === expected) {
      const name = nameFromItem(m[2]!);
      run.push(name ?? "");
      expected += 1;
    } else if (n === 1) {
      if (run.length > best.length) best = run;
      run = [nameFromItem(m[2]!) ?? ""];
      expected = 2;
    } else {
      if (run.length > best.length) best = run;
      run = [];
      expected = 1;
    }
  }
  if (run.length > best.length) best = run;
  const orderedList = best.length >= 2 && best.every((n) => n.length > 0) ? best : null;

  const named: string[] = [];
  if (orderedList) named.push(...orderedList);
  for (const line of lines) {
    const b = line.match(BULLET);
    if (b) {
      const n = nameFromItem(b[1]!);
      if (n) named.push(n);
    }
  }
  for (const m of answerText.matchAll(/\*\*(.+?)\*\*/g)) {
    const n = nameFromItem(`**${m[1]}**`);
    if (n && looksLikeBusinessName(n)) named.push(n);
  }
  return { namedBusinesses: dedupe(named).slice(0, 25), orderedList };
}
