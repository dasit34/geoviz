/**
 * Lead CSV import/export — hand-rolled (no csv-parse/papaparse dependency;
 * the shape here is flat business fields with no nesting, which doesn't
 * justify adding a library per CLAUDE.md's "no unnecessary libraries"
 * rule). RFC4180-ish: supports quoted fields, embedded commas, embedded
 * newlines, and doubled-quote escaping (`""` inside a quoted field).
 *
 * Import rows are intentionally NOT written to the DB here — this module
 * only parses text into typed rows. The import API route
 * (`src/app/api/admin/leads/import/route.ts`) is responsible for running
 * each row through the existing dedup pipeline
 * (`src/lib/leads/dedupe.ts`), mirroring how CSV rows and discovery-
 * provider records both ultimately become `NormalizedBusinessRecord`s.
 */

export type ParsedLeadRow = {
  businessName: string;
  website: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  rating: number | null;
  reviewCount: number | null;
  notes: string | null;
};

export type ParseLeadCsvResult = {
  rows: ParsedLeadRow[];
  errors: { line: number; message: string }[];
};

// Accepted header aliases, all matched case-insensitively after
// lowercasing + stripping spaces/underscores/hyphens.
const HEADER_ALIASES: Record<string, keyof ParsedLeadRow> = {
  businessname: "businessName",
  business: "businessName",
  name: "businessName",
  company: "businessName",
  website: "website",
  url: "website",
  domain: "website",
  category: "category",
  industry: "category",
  city: "city",
  state: "state",
  address: "address",
  phone: "phone",
  phonenumber: "phone",
  contactname: "contactName",
  contact: "contactName",
  contacttitle: "contactTitle",
  title: "contactTitle",
  contactemail: "contactEmail",
  email: "contactEmail",
  rating: "rating",
  googlerating: "rating",
  reviewcount: "reviewCount",
  reviews: "reviewCount",
  notes: "notes",
};

function normalizeHeaderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** Splits raw CSV text into rows of raw string cells, honoring quoting. */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Trailing field/row (file may or may not end with a newline).
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Parses CSV text into normalized lead rows using a header row to map
 * columns. Unknown columns are ignored. A row missing `businessName` is
 * reported as an error rather than silently dropped.
 */
export function parseLeadCsv(text: string): ParseLeadCsvResult {
  const rawRows = tokenizeCsv(text);
  const errors: ParseLeadCsvResult["errors"] = [];
  if (rawRows.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "File is empty." }] };
  }

  const headerRow = rawRows[0];
  const columnMap: (keyof ParsedLeadRow | null)[] = headerRow.map((h) => {
    const key = normalizeHeaderKey(h);
    return HEADER_ALIASES[key] ?? null;
  });

  if (!columnMap.includes("businessName")) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message:
            'No "businessName" column found (accepted headers: Business Name, Business, Name, Company).',
        },
      ],
    };
  }

  const rows: ParsedLeadRow[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const cells = rawRows[r];
    const lineNumber = r + 1;
    const byField: Partial<Record<keyof ParsedLeadRow, string>> = {};
    for (let c = 0; c < columnMap.length; c++) {
      const field = columnMap[c];
      if (!field) continue;
      const value = (cells[c] ?? "").trim();
      if (value) byField[field] = value;
    }

    const businessName = byField.businessName?.trim();
    if (!businessName) {
      // Skip fully blank trailing lines quietly.
      if (cells.every((c) => c.trim() === "")) continue;
      errors.push({ line: lineNumber, message: "businessName is required." });
      continue;
    }

    const ratingRaw = byField.rating ? Number(byField.rating) : NaN;
    const reviewCountRaw = byField.reviewCount ? Number(byField.reviewCount) : NaN;

    rows.push({
      businessName,
      website: byField.website ?? null,
      category: byField.category ?? null,
      city: byField.city ?? null,
      state: byField.state ?? null,
      address: byField.address ?? null,
      phone: byField.phone ?? null,
      contactName: byField.contactName ?? null,
      contactTitle: byField.contactTitle ?? null,
      contactEmail: byField.contactEmail ?? null,
      rating: Number.isFinite(ratingRaw) ? ratingRaw : null,
      reviewCount: Number.isFinite(reviewCountRaw) ? Math.round(reviewCountRaw) : null,
      notes: byField.notes ?? null,
    });
  }

  return { rows, errors };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const EXPORT_COLUMNS = [
  "businessName",
  "website",
  "category",
  "city",
  "state",
  "address",
  "phone",
  "contactName",
  "contactTitle",
  "contactEmail",
  "rating",
  "reviewCount",
  "source",
  "qualificationScore",
  "status",
  "notes",
  "discoveredAt",
  "createdAt",
] as const;

/** Serializes leads to a CSV string (header row + one row per lead). */
export function serializeLeadsToCsv(
  leads: Record<string, unknown>[],
): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const lead of leads) {
    lines.push(EXPORT_COLUMNS.map((col) => csvEscape(lead[col])).join(","));
  }
  return lines.join("\r\n");
}
