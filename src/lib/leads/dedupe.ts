/**
 * Cross-provider lead dedup/merge — the actual mechanism that makes
 * the discovery layer provider-agnostic in practice, not just in
 * type signatures. Turns one `NormalizedBusinessRecord` (from any
 * provider) into either a new `Lead` row or an attached
 * `LeadSourceRef` on an existing one.
 *
 * Match order, most confident signal first:
 *   1. (provider, providerId) exact match — same provider has
 *      already surfaced this exact business (handles re-running the
 *      same search).
 *   2. domain exact match — a website URL is provider-independent
 *      ground truth, the strongest cross-provider signal.
 *   3. phoneNormalized exact match.
 *   4. nameNormalized + addressNormalized (or at minimum city+state)
 *      combined match — weakest alone (common business names collide
 *      across cities), only used combined to avoid false merges.
 *
 * On any match: no new Lead row. Attach a new LeadSourceRef, backfill
 * any fields the existing lead is missing, never overwrite existing
 * non-null values.
 */

import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { NormalizedBusinessRecord } from "@/lib/discovery/types";
import {
  normalizeAddressForDedup,
  normalizeBusinessNameForDedup,
  normalizeDomain,
  normalizeIndustry,
  normalizePhoneDigits,
} from "@/lib/leads/normalize";

export type ImportOutcome = {
  lead: Lead;
  matched: boolean;
  matchedOn?: "provider_id" | "domain" | "phone" | "name_address";
};

async function findExistingLead(fields: {
  provider: string;
  providerId: string;
  domain: string | null;
  phoneNormalized: string | null;
  businessNameNormalized: string | null;
  addressNormalized: string | null;
  city: string | null;
  state: string | null;
}): Promise<{ lead: Lead; matchedOn: ImportOutcome["matchedOn"] } | null> {
  // 1. Same provider, same external id.
  const existingRef = await prisma.leadSourceRef.findUnique({
    where: {
      provider_providerId: {
        provider: fields.provider,
        providerId: fields.providerId,
      },
    },
    include: { lead: true },
  });
  if (existingRef) return { lead: existingRef.lead, matchedOn: "provider_id" };

  // 2. Domain — provider-independent ground truth.
  if (fields.domain) {
    const byDomain = await prisma.lead.findFirst({
      where: { domain: fields.domain },
    });
    if (byDomain) return { lead: byDomain, matchedOn: "domain" };
  }

  // 3. Phone — exact digits match.
  if (fields.phoneNormalized) {
    const byPhone = await prisma.lead.findFirst({
      where: { phoneNormalized: fields.phoneNormalized },
    });
    if (byPhone) return { lead: byPhone, matchedOn: "phone" };
  }

  // 4. Name + address (or name + city/state) combined — weakest
  // signal, only used combined to avoid cross-city false merges.
  if (fields.businessNameNormalized) {
    if (fields.addressNormalized) {
      const byNameAddress = await prisma.lead.findFirst({
        where: {
          businessNameNormalized: fields.businessNameNormalized,
          addressNormalized: fields.addressNormalized,
        },
      });
      if (byNameAddress) return { lead: byNameAddress, matchedOn: "name_address" };
    } else if (fields.city && fields.state) {
      const byNameCity = await prisma.lead.findFirst({
        where: {
          businessNameNormalized: fields.businessNameNormalized,
          city: fields.city,
          state: fields.state,
        },
      });
      if (byNameCity) return { lead: byNameCity, matchedOn: "name_address" };
    }
  }

  return null;
}

/**
 * Import one discovered business record: match against existing
 * leads across every provider, or create a new one. Never throws on
 * a duplicate — dedup is the expected happy path, not an error.
 */
export async function importDiscoveredBusiness(
  record: NormalizedBusinessRecord,
): Promise<ImportOutcome> {
  const domain = normalizeDomain(record.website);
  const phoneNormalized = normalizePhoneDigits(record.phone);
  const businessNameNormalized = normalizeBusinessNameForDedup(record.businessName);
  const addressNormalized = normalizeAddressForDedup(record.address);
  const category = normalizeIndustry(record.categoryRaw).normalized;

  const match = await findExistingLead({
    provider: record.provider,
    providerId: record.providerId,
    domain,
    phoneNormalized,
    businessNameNormalized,
    addressNormalized,
    city: record.city,
    state: record.state,
  });

  if (match) {
    // Attach this provider's reference if it isn't already there
    // (the provider_id branch above already covers the exact-repeat
    // case, so this only fires for a genuinely new provider on an
    // existing lead).
    await prisma.leadSourceRef.upsert({
      where: {
        provider_providerId: {
          provider: record.provider,
          providerId: record.providerId,
        },
      },
      create: {
        leadId: match.lead.id,
        provider: record.provider,
        providerId: record.providerId,
      },
      update: {},
    });

    // Backfill blanks only — never overwrite an existing value with
    // one from a lower-confidence source.
    const backfill: Record<string, unknown> = {};
    if (!match.lead.website && record.website) backfill.website = record.website;
    if (!match.lead.domain && domain) backfill.domain = domain;
    if (!match.lead.phone && record.phone) backfill.phone = record.phone;
    if (!match.lead.phoneNormalized && phoneNormalized)
      backfill.phoneNormalized = phoneNormalized;
    if (!match.lead.address && record.address) backfill.address = record.address;
    if (!match.lead.addressNormalized && addressNormalized)
      backfill.addressNormalized = addressNormalized;
    if (!match.lead.city && record.city) backfill.city = record.city;
    if (!match.lead.state && record.state) backfill.state = record.state;
    if (!match.lead.rating && record.rating !== null) backfill.rating = record.rating;
    if (!match.lead.reviewCount && record.reviewCount !== null)
      backfill.reviewCount = record.reviewCount;
    if (!match.lead.category && category !== "unknown") backfill.category = category;
    if (!match.lead.zip && record.zip) backfill.zip = record.zip;
    if (match.lead.latitude === null && record.latitude != null)
      backfill.latitude = record.latitude;
    if (match.lead.longitude === null && record.longitude != null)
      backfill.longitude = record.longitude;
    if (!match.lead.mapsUrl && record.mapsUrl) backfill.mapsUrl = record.mapsUrl;

    const lead =
      Object.keys(backfill).length > 0
        ? await prisma.lead.update({ where: { id: match.lead.id }, data: backfill })
        : match.lead;

    return { lead, matched: true, matchedOn: match.matchedOn };
  }

  const lead = await prisma.lead.create({
    data: {
      businessName: record.businessName,
      businessNameNormalized: businessNameNormalized ?? record.businessName.toLowerCase(),
      website: record.website,
      domain,
      phoneNormalized,
      addressNormalized,
      category: category !== "unknown" ? category : null,
      city: record.city,
      state: record.state,
      address: record.address,
      phone: record.phone,
      source: record.provider,
      sourceId: record.providerId,
      rating: record.rating,
      reviewCount: record.reviewCount,
      zip: record.zip ?? null,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
      mapsUrl: record.mapsUrl ?? null,
      status: "NEW",
      sourceRefs: {
        create: { provider: record.provider, providerId: record.providerId },
      },
    },
  });

  return { lead, matched: false };
}
