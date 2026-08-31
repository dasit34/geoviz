import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { parseLeadCsv } from "@/lib/leads/csv";
import { importDiscoveredBusiness } from "@/lib/leads/dedupe";
import { normalizeDomain } from "@/lib/business/normalize-domain";
import type { NormalizedBusinessRecord } from "@/lib/discovery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 2000;

/**
 * POST /api/admin/leads/import — CSV bulk import. `{ csv: string,
 * leadListId?: string }`. Runs every row through the SAME cross-provider
 * dedup pipeline (`importDiscoveredBusiness`) that the Google Places
 * discovery route uses — a CSV row is just another
 * `NormalizedBusinessRecord` source, tagged `provider: "csv_import"`.
 *
 * Since a CSV row has no natural external id, `providerId` is derived
 * deterministically (domain when present, else a hash of
 * name+city+state) so re-uploading the same file twice doesn't create
 * duplicate LeadSourceRefs or duplicate leads.
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:import",
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { csv?: unknown; leadListId?: unknown } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const csvText = typeof body.csv === "string" ? body.csv : "";
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csv text is required" }, { status: 400 });
  }
  const leadListId = typeof body.leadListId === "string" ? body.leadListId : null;

  if (leadListId) {
    const list = await prisma.leadList.findUnique({ where: { id: leadListId } });
    if (!list) {
      return NextResponse.json({ error: "leadListId not found" }, { status: 404 });
    }
  }

  const { rows, errors: parseErrors } = parseLeadCsv(csvText);

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `CSV has ${rows.length} rows, exceeding the ${MAX_ROWS}-row import cap. Split the file and re-upload.` },
      { status: 400 },
    );
  }

  let imported = 0;
  let matched = 0;
  const addedToList: string[] = [];
  const rowErrors: { line: number; message: string }[] = [...parseErrors];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const domain = normalizeDomain(row.website);
    const providerId =
      domain ??
      createHash("sha1")
        .update(`${row.businessName.toLowerCase()}|${row.city ?? ""}|${row.state ?? ""}`)
        .digest("hex");

    const record: NormalizedBusinessRecord = {
      provider: "csv_import",
      providerId,
      businessName: row.businessName,
      website: row.website,
      phone: row.phone,
      address: row.address,
      city: row.city,
      state: row.state,
      categoryRaw: row.category,
      rating: row.rating,
      reviewCount: row.reviewCount,
    };

    try {
      const outcome = await importDiscoveredBusiness(record);
      if (outcome.matched) matched += 1;
      else imported += 1;

      // Backfill contact fields / notes that importDiscoveredBusiness
      // doesn't touch (it's discovery-provider-shaped, no contact/notes
      // concept) — only when the lead doesn't already have them.
      const contactPatch: Record<string, unknown> = {};
      if (!outcome.lead.contactName && row.contactName) contactPatch.contactName = row.contactName;
      if (!outcome.lead.contactTitle && row.contactTitle) contactPatch.contactTitle = row.contactTitle;
      if (!outcome.lead.contactEmail && row.contactEmail) contactPatch.contactEmail = row.contactEmail;
      if (!outcome.lead.notes && row.notes) contactPatch.notes = row.notes;
      if (Object.keys(contactPatch).length > 0) {
        await prisma.lead.update({ where: { id: outcome.lead.id }, data: contactPatch });
      }

      if (leadListId) {
        await prisma.leadListMembership.upsert({
          where: { leadId_leadListId: { leadId: outcome.lead.id, leadListId } },
          create: { leadId: outcome.lead.id, leadListId },
          update: {},
        });
        addedToList.push(outcome.lead.id);
      }
    } catch (err) {
      rowErrors.push({
        line: i + 2, // +1 for header row, +1 for 1-indexing
        message: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  console.log(
    `[admin-leads] csv import rows=${rows.length} imported=${imported} matched=${matched} errors=${rowErrors.length} leadListId=${leadListId ?? "none"}`,
  );

  return NextResponse.json({
    rowsParsed: rows.length,
    imported,
    matched,
    addedToList: addedToList.length,
    errors: rowErrors,
  });
}
