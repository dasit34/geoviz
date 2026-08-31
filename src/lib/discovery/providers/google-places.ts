/**
 * GooglePlacesProvider — business discovery via the Places API (New)
 * Text Search endpoint.
 *
 * This file's ONLY job is translating Google's response shape into
 * `NormalizedBusinessRecord` — GeoViz's own field names, verbatim
 * values, no lowercasing, no taxonomy mapping, no phone reformatting.
 * All normalization/dedup logic lives in `src/lib/leads/`, which has
 * never heard of Google Places. See `src/lib/discovery/types.ts` for
 * the contract this file implements.
 *
 * Gating ladder (mirrors `src/lib/validators/providers/*`):
 *   1. GOOGLE_PLACES_API_KEY not set → enabled() = false, caller sees
 *      a clean "no discovery provider configured" response. Nothing
 *      is purchased/activated by this file existing — the key must be
 *      manually added.
 *   2. Otherwise → real Places API call.
 *
 * Cost note: Text Search (New) returns at most 20 results per page.
 * `MAX_PAGES` bounds how many paginated requests one discovery run
 * can make — a hard ceiling independent of the UI's requested count,
 * so a large/typo'd request can't runaway-spend. The caller
 * (`POST /api/admin/leads/discover`) enforces its own separate
 * spend guardrail on top of this (`LeadDiscoveryRun`, see that route).
 */

import { readApiKey } from "../../validators/apiKey";
import type {
  BusinessDiscoveryProvider,
  DiscoveryInput,
  DiscoveryResult,
  NormalizedBusinessRecord,
} from "../types";

const PROVIDER_NAME = "google_places";
const REQUIRED_ENV_VARS = ["GOOGLE_PLACES_API_KEY"] as const;

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const REQUEST_TIMEOUT_MS = 15_000;
const RESULTS_PER_PAGE = 20;
const MAX_PAGES = 5; // hard ceiling: at most 100 results per discovery run

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.businessStatus",
  "nextPageToken",
].join(",");

type PlacesAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type PlacesPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlacesAddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  businessStatus?: string;
};

type PlacesSearchTextResponse = {
  places?: PlacesPlace[];
  nextPageToken?: string;
};

function addressComponent(
  components: PlacesAddressComponent[] | undefined,
  type: string,
): string | null {
  if (!components) return null;
  const match = components.find((c) => c.types?.includes(type));
  return match?.longText ?? null;
}

function toNormalizedRecord(place: PlacesPlace): NormalizedBusinessRecord | null {
  // A place with no id or name isn't usable — skip rather than emit
  // a half-populated record.
  if (!place.id || !place.displayName?.text) return null;
  return {
    provider: PROVIDER_NAME,
    providerId: place.id,
    businessName: place.displayName.text,
    website: place.websiteUri ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    address: place.formattedAddress ?? null,
    city: addressComponent(place.addressComponents, "locality"),
    state: addressComponent(
      place.addressComponents,
      "administrative_area_level_1",
    ),
    categoryRaw: place.primaryType ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount:
      typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    raw: place,
  };
}

function missingKeys(): string[] {
  return REQUIRED_ENV_VARS.filter((k) => readApiKey(k) === null);
}

function buildTextQuery(input: DiscoveryInput): string {
  const location = input.state ? `${input.city}, ${input.state}` : input.city;
  const radiusPhrase = input.radiusMiles
    ? ` within ${input.radiusMiles} miles`
    : "";
  return `${input.category} in ${location}${radiusPhrase}`;
}

async function fetchPage(
  apiKey: string,
  input: DiscoveryInput,
  pageToken: string | null,
): Promise<PlacesSearchTextResponse> {
  const response = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: buildTextQuery(input),
      pageSize: RESULTS_PER_PAGE,
      ...(pageToken ? { pageToken } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
    );
  }
  return (await response.json()) as PlacesSearchTextResponse;
}

export const GooglePlacesProvider: BusinessDiscoveryProvider = {
  name: PROVIDER_NAME,
  requiredEnvVars: REQUIRED_ENV_VARS,
  enabled(): boolean {
    return missingKeys().length === 0;
  },
  async discoverBusinesses(input: DiscoveryInput): Promise<DiscoveryResult> {
    const missing = missingKeys();
    if (missing.length > 0) {
      return {
        records: [],
        providerRequestCount: 0,
        error: `${missing.join(", ")} not set`,
      };
    }

    const apiKey = readApiKey("GOOGLE_PLACES_API_KEY")!;
    const records: NormalizedBusinessRecord[] = [];
    let pageToken: string | null = null;
    let pagesFetched = 0;

    try {
      do {
        const page = await fetchPage(apiKey, input, pageToken);
        pagesFetched += 1;
        for (const place of page.places ?? []) {
          const record = toNormalizedRecord(place);
          if (record) records.push(record);
        }
        pageToken = page.nextPageToken ?? null;
        console.log(
          `[discovery] provider=${PROVIDER_NAME} page=${pagesFetched} received=${page.places?.length ?? 0} totalSoFar=${records.length}`,
        );
      } while (
        pageToken &&
        pagesFetched < MAX_PAGES &&
        records.length < input.limit
      );

      return { records, providerRequestCount: pagesFetched };
    } catch (err) {
      const e = err as Error;
      console.error(
        `[discovery] provider=${PROVIDER_NAME} failed after page=${pagesFetched}: ${e.message ?? String(err)}`,
      );
      return {
        records,
        providerRequestCount: pagesFetched,
        error: e.message ?? String(err),
      };
    }
  },
};
