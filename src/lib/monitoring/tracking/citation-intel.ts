/**
 * Citation intelligence (pure): which sources AI answers lean on, which
 * support the customer vs competitors, and where competitors are cited
 * but the customer isn't. An "opportunity" is evidence of a gap, not a
 * promise that earning that citation improves rankings.
 */
import { domainMatches } from "./citations";
import type { CompetitorRef, ResultForMetrics } from "./types";

export type DomainStat = {
  domain: string;
  answers: number;
  withCustomer: number;
  withCompetitor: number;
  isCustomerSite: boolean;
  competitorSite: string | null;
};

export type CitationIntel = {
  measuredAnswers: number;
  answersWithCitations: number;
  frequentDomains: DomainStat[];
  supportingCustomer: DomainStat[];
  supportingCompetitors: DomainStat[];
  opportunities: DomainStat[];
  customerSiteCitedCount: number;
};

export function buildCitationIntel(
  results: ResultForMetrics[],
  customerDomain: string | null,
  competitors: CompetitorRef[],
): CitationIntel {
  const measured = results.filter((r) => r.status === "measured");
  const stats = new Map<string, DomainStat>();
  for (const r of measured) {
    const competitorNamed = r.competitorIdsMentioned.length > 0;
    for (const d of new Set(r.citedDomains)) {
      const s =
        stats.get(d) ??
        ({
          domain: d,
          answers: 0,
          withCustomer: 0,
          withCompetitor: 0,
          isCustomerSite: domainMatches(d, customerDomain),
          competitorSite: competitors.find((c) => c.domain && domainMatches(d, c.domain))?.name ?? null,
        } satisfies DomainStat);
      s.answers += 1;
      if (r.mentioned === true) s.withCustomer += 1;
      if (competitorNamed) s.withCompetitor += 1;
      stats.set(d, s);
    }
  }
  const all = [...stats.values()].sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain));
  const thirdParty = all.filter((s) => !s.isCustomerSite && !s.competitorSite);
  return {
    measuredAnswers: measured.length,
    answersWithCitations: measured.filter((r) => r.citedDomains.length > 0).length,
    frequentDomains: all.slice(0, 10),
    supportingCustomer: all.filter((s) => s.withCustomer > 0).slice(0, 10),
    supportingCompetitors: all.filter((s) => s.withCompetitor > 0 && !s.isCustomerSite).slice(0, 10),
    // Third-party sources cited alongside competitors (≥2 answers) but never alongside the customer.
    opportunities: thirdParty.filter((s) => s.withCompetitor >= 2 && s.withCustomer === 0).slice(0, 8),
    customerSiteCitedCount: all.filter((s) => s.isCustomerSite).reduce((n, s) => n + s.answers, 0),
  };
}
