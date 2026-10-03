import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/admin-auth";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { resolveAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { monitoringAuthDeps } from "@/lib/monitoring/auth/http";
import { prismaMonitoringAuthStore } from "@/lib/monitoring/auth/prisma-auth-store";
import { issueLoginLink } from "@/lib/monitoring/auth/service";
import { compensateDuplicate } from "@/lib/monitoring/duplicate-compensation";
import { compensationDeps } from "@/lib/monitoring/duplicate-compensation-prisma";

export const runtime = "nodejs";

/**
 * Operator actions for monitoring customer sign-in. Requires the admin
 * session cookie or ADMIN_SECRET (header, ?key=, or a `key` form field).
 *  - send_sign_in_link: emails the account owner a single-use 24-hour link
 *    (always to the account's own email — the operator never sees the link).
 *  - revoke_sessions: signs the customer out everywhere.
 *  - retry_compensation: re-runs the automatic duplicate compensation
 *    (idempotent — never cancels/refunds twice, never touches the original).
 *  - resolve_duplicate: marks a duplicate reviewed by an operator.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const field = (k: string) => (typeof form?.get(k) === "string" ? String(form?.get(k)).trim() : "");
  const formKey = field("key");
  const key = readAdminKeyFromRequest(req) ?? formKey;
  if (!isAuthed() && !isValidAdminKey(key)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sub = await prisma.monitoringSubscription.findUnique({ where: { id: field("subscriptionId") } });
  if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

  const back = (notice: string) => {
    const url = new URL("/admin/monitoring-customers", resolveAppBaseUrl(req));
    // Carry the key back only when the admin page itself posted it (the
    // page is ?key= authenticated); never echo a header secret into a URL.
    if (formKey && !isAuthed() && isValidAdminKey(formKey)) url.searchParams.set("key", formKey);
    url.searchParams.set("notice", notice);
    return NextResponse.redirect(url, 303);
  };

  if (field("action") === "retry_compensation") {
    const dup = await prisma.monitoringDuplicateSubscription.findFirst({ where: { id: field("duplicateId"), monitoringSubscriptionId: sub.id } });
    if (!dup) return back("Duplicate not found.");
    try {
      const r = await compensateDuplicate(dup.stripeSubscriptionId, compensationDeps(resolveAppBaseUrl(req)));
      return back(`Compensation: ${r.outcome}${"reason" in r ? ` (${r.reason})` : ""}.`);
    } catch (err) {
      console.error("[admin-monitoring-customers] compensation retry failed:", err instanceof Error ? err.message : err);
      return back("Compensation retry failed — see the row's last error.");
    }
  }

  if (field("action") === "resolve_duplicate") {
    const { count } = await prisma.monitoringDuplicateSubscription.updateMany({
      where: { id: field("duplicateId"), monitoringSubscriptionId: sub.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    return back(count === 1 ? "Duplicate marked reviewed." : "Nothing to mark.");
  }

  const customer = sub.customerId
    ? await prismaMonitoringAuthStore.findCustomerById(sub.customerId)
    : await prismaMonitoringAuthStore.ensureCustomerForEmail(sub.email, sub.stripeCustomerId);
  if (!customer) return back("No account could be connected for this subscription.");

  try {
    switch (field("action")) {
      case "send_sign_in_link":
        await issueLoginLink(customer, "admin", monitoringAuthDeps(req));
        console.log(`[admin-monitoring-customers] sign-in link sent for customer=${customer.id}`);
        return back(`Sign-in link sent to the account email (valid 24 hours, single use).`);
      case "revoke_sessions": {
        const n = await prismaMonitoringAuthStore.revokeAllSessions(customer.id, new Date());
        console.log(`[admin-monitoring-customers] revoked ${n} session(s) for customer=${customer.id}`);
        return back(`Signed out ${n} session(s).`);
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    console.error("[admin-monitoring-customers] action failed:", err instanceof Error ? err.message : err);
    return back("Action failed — see server logs.");
  }
}
