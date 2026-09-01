/**
 * Outbound-provider contract — the send-side counterpart to
 * `src/lib/discovery/types.ts` and `src/lib/enrichment/types.ts`.
 * Mirrors both patterns deliberately: `name`/`enabled()`/
 * `requiredEnvVars` gated purely on API-key presence, one (or a
 * few) narrow async methods, and a "provider adapter" contract — a
 * provider file is the ONLY place that outbound-service-specific
 * field names/shapes may appear. GeoViz's `Lead`/`LeadOutreach`
 * tables are the source of truth; an OutboundProvider never becomes
 * one.
 */

export interface OutboundCampaign {
  id: string;
  name: string;
  /** Provider's own status vocabulary — never assumed canonical. */
  status?: string | null;
}

export interface OutboundLeadInput {
  /** GeoViz Lead.id — never sent to the provider; used only for
   * matching results back to the row that requested them. */
  leadId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  /** string/number/boolean/null only — matches Instantly's own
   * custom_variables constraint; kept provider-agnostic here since
   * it's a reasonable general shape for any outbound provider. */
  customVariables: Record<string, string | number | boolean | null>;
}

export type SendLeadOutcome =
  | { leadId: string; ok: true; providerLeadId: string | null }
  | { leadId: string; ok: false; error: string };

export interface SendLeadsResult {
  outcomes: SendLeadOutcome[];
  /** Provider-level failure (e.g. campaign not found) that aborted
   * the whole batch before any per-lead outcome could be determined. */
  error?: string;
}

export interface OutboundLeadStatus {
  /** Provider's own lead id — used to match back to LeadOutreach.providerLeadId. */
  providerLeadId: string;
  email: string | null;
  /** Provider's raw status/status_summary — normalized separately by
   * src/lib/leads/normalizeOutreachStatus.ts, never assumed canonical
   * here. */
  rawStatus: unknown;
}

export interface OutboundProvider {
  /** Matches the value stored in `LeadOutreach.provider` on success. */
  name: string;
  enabled(): boolean;
  requiredEnvVars: readonly string[];
  listCampaigns(): Promise<{ campaigns: OutboundCampaign[]; error?: string }>;
  /** Never auto-retried by the provider itself — see the calling
   * route's/provider file's doc comments for why. */
  sendLeads(campaignId: string, leads: OutboundLeadInput[]): Promise<SendLeadsResult>;
  /** Read-only — safe to retry internally on transient failure. */
  fetchCampaignLeadStatuses(
    campaignId: string,
  ): Promise<{ statuses: OutboundLeadStatus[]; error?: string }>;
}
