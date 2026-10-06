import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/admin-auth";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { prisma } from "@/lib/db";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { prismaProofStores } from "@/lib/monitoring/proof/prisma-store";
import { parseDraftItems } from "@/lib/monitoring/proof/question-set";
import {
  activateSet,
  approveSet,
  assessAndRecord,
  createExperiment,
  editDraft,
  newVersionFrom,
  proposeDraft,
  type Result,
} from "@/lib/monitoring/proof/service";

export const runtime = "nodejs";

/**
 * Proof Engine v1 operator actions (question sets + experiments). Requires the
 * admin session cookie or ADMIN_SECRET, and the monitoring module. Every
 * action is scoped to the one subscription named in the form; nothing here
 * calls an AI provider, edits a website, or emails anyone.
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const field = (k: string) => (typeof form?.get(k) === "string" ? String(form?.get(k)).trim() : "");
  const key = readAdminKeyFromRequest(req) ?? field("key");
  if (!isAuthed() && !isValidAdminKey(key)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sub = await prisma.monitoringSubscription.findUnique({
    where: { id: field("subscriptionId") },
    select: { id: true, websiteUrl: true, businessName: true },
  });
  if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  const now = new Date();
  const setId = field("setId");
  let result: Result<unknown>;
  switch (field("action")) {
    case "propose_draft": {
      const list = (k: string) => field(k).split(",").map((s) => s.trim()).filter(Boolean);
      result = await proposeDraft(prismaProofStores, sub, {
        businessName: field("businessName") || sub.businessName || "",
        businessCategory: field("businessCategory"),
        categoryPlural: field("categoryPlural") || null,
        services: list("services"),
        city: field("city") || null,
        state: field("state") || null,
        serviceArea: field("serviceArea") || null,
        isLocal: field("isLocal") === "on",
        competitorNames: list("competitorNames"),
      }, now);
      break;
    }
    case "edit_draft": {
      const items = parseDraftItems(field("items"));
      result = typeof items === "string" ? { ok: false, reason: items } : await editDraft(prismaProofStores, sub, setId, items);
      break;
    }
    case "approve_set":
      result = await approveSet(prismaProofStores, sub, setId, "operator", now);
      break;
    case "activate_set":
      result = await activateSet(prismaProofStores, sub, setId, now);
      break;
    case "new_version":
      result = await newVersionFrom(prismaProofStores, sub, setId, now);
      break;
    case "create_experiment":
      result = await createExperiment(prismaProofStores, sub, { taskId: field("taskId"), expectedCategory: field("expectedCategory") }, now);
      break;
    case "assess_experiment":
      result = await assessAndRecord(prismaProofStores, sub, field("experimentId"), now);
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const back = new URL(`/admin/proof/${encodeURIComponent(sub.id)}`, req.url);
  if (key && !isAuthed()) back.searchParams.set("key", key);
  back.searchParams.set("notice", result.ok ? "Saved." : result.reason);
  return NextResponse.redirect(back, 303);
}
