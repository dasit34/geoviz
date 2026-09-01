/**
 * Normalizes a raw Instantly lead-status value (from `/leads/list`,
 * via `fetchCampaignLeadStatuses()`) into GeoViz's own outreach
 * status vocabulary (`LeadOutreach.status`).
 *
 * IMPORTANT — the exact enum/numeric meaning of Instantly's status
 * fields (e.g. `lt_interest_status`) was NOT independently verified
 * (see `src/lib/outbound/providers/instantly.ts`'s doc comment). This
 * function is deliberately defensive: it pattern-matches on
 * recognizable keywords wherever they appear (string value, or a
 * string found inside an object), and falls back to `"ACTIVE"` —
 * never invents a specific status it can't support, never throws.
 * The raw value should always be preserved separately in
 * `LeadOutreach.lastProviderPayload` so nothing is lost even when
 * this function can't confidently classify it.
 */

export type OutreachStatus =
  | "QUEUED"
  | "SENT_TO_INSTANTLY"
  | "ACTIVE"
  | "REPLIED"
  | "INTERESTED"
  | "BOUNCED"
  | "UNSUBSCRIBED"
  | "FAILED";

const KEYWORD_MAP: { pattern: RegExp; status: OutreachStatus }[] = [
  { pattern: /bounce/i, status: "BOUNCED" },
  { pattern: /unsubscri/i, status: "UNSUBSCRIBED" },
  { pattern: /interested/i, status: "INTERESTED" },
  { pattern: /reply|replied/i, status: "REPLIED" },
  { pattern: /fail|error|invalid/i, status: "FAILED" },
];

function scanValue(value: unknown, depth = 0): OutreachStatus | null {
  if (depth > 2) return null;
  if (typeof value === "string") {
    for (const { pattern, status } of KEYWORD_MAP) {
      if (pattern.test(value)) return status;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = scanValue(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = scanValue(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  return null;
}

/** Pure — no I/O, never throws, never returns an unrecognized status. */
export function normalizeOutreachStatus(rawStatus: unknown): OutreachStatus {
  return scanValue(rawStatus) ?? "ACTIVE";
}
