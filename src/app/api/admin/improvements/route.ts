import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/admin-auth";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { prisma } from "@/lib/db";
import {
  addTaskNote,
  createTaskFromRecommendation,
  queueVerification,
  regenerateDraft,
  saveFacts,
  setTaskOwner,
  transitionTask,
} from "@/lib/monitoring/improvements/service";
import type { MutationResult } from "@/lib/monitoring/tracking/service";

export const runtime = "nodejs";

/**
 * Operator review actions on improvement tasks. Requires the existing admin
 * session cookie or ADMIN_SECRET (header, ?key=, or a `key` form field).
 * Operators may verify ONLY tasks the website scanner can't check, and must
 * record an https evidence URL + note.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const field = (k: string) => (typeof form?.get(k) === "string" ? String(form?.get(k)).trim() : "");
  const key = readAdminKeyFromRequest(req) ?? field("key");
  if (!isAuthed() && !isValidAdminKey(key)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sub = await prisma.monitoringSubscription.findUnique({ where: { id: field("subscriptionId") } });
  if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  const taskId = field("taskId");
  let result: MutationResult;
  switch (field("action")) {
    case "create_from_recommendation":
      result = await createTaskFromRecommendation(sub, field("recommendationId"), "operator");
      break;
    case "approve":
      result = await transitionTask(sub, { taskId, to: "approved" }, "operator");
      break;
    case "start":
      result = await transitionTask(sub, { taskId, to: "in_progress" }, "operator");
      break;
    case "mark_implemented":
      result = await transitionTask(sub, { taskId, to: "implemented", notes: field("notes"), implementationUrl: field("implementationUrl") || undefined }, "operator");
      break;
    case "manual_verify":
      result = await transitionTask(sub, { taskId, to: "verified", notes: field("notes"), evidenceUrl: field("evidenceUrl") }, "operator");
      break;
    case "revoke_verification":
      result = await transitionTask(sub, { taskId, to: "implemented", notes: field("notes") }, "operator");
      break;
    case "dismiss":
      result = await transitionTask(sub, { taskId, to: "dismissed", reason: field("reason") }, "operator");
      break;
    case "assign_owner":
      result = await setTaskOwner(sub, taskId, field("owner"));
      break;
    case "add_note":
      result = await addTaskNote(sub, taskId, field("note"), "operator");
      break;
    case "regenerate_draft":
      result = await regenerateDraft(sub, taskId, "operator");
      break;
    case "requeue_verification":
      result = await queueVerification(sub, taskId);
      break;
    case "save_facts":
      result = await saveFacts(sub, Object.fromEntries(["name", "phone", "street", "city", "region", "postal", "hours", "services", "serviceAreas", "licenses"].map((k) => [k, field(k)])), "operator");
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const back = new URL("/admin/improvements", req.url);
  if (key && !isAuthed()) back.searchParams.set("key", key);
  if (!result.ok) back.searchParams.set("notice", result.message);
  return NextResponse.redirect(back, 303);
}
