import { NextResponse } from "next/server";

import {
  SIGN_IN_PATH,
  clientKey,
  forbiddenOriginResponse,
  isSameOriginRequest,
  monitoringAuthDeps,
  redirectTo,
} from "@/lib/monitoring/auth/http";
import { requestSignInLink } from "@/lib/monitoring/auth/service";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const runtime = "nodejs";

/**
 * Sign-in page form: "email me a sign-in link". The response is the same
 * whether or not the email has monitoring (no account enumeration).
 * Rate-limited per IP and per email in the database.
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginRequest(req)) return forbiddenOriginResponse();

  const form = await req.formData().catch(() => null);
  const email = typeof form?.get("email") === "string" ? String(form.get("email")) : "";

  try {
    const result = await requestSignInLink({ email, clientKey: clientKey(req) }, monitoringAuthDeps(req));
    if (result.outcome === "invalid_email") return redirectTo(req, `${SIGN_IN_PATH}?error=email`);
    if (result.outcome === "rate_limited") return redirectTo(req, `${SIGN_IN_PATH}?error=rate_limited`);
    return redirectTo(req, `${SIGN_IN_PATH}/sent`);
  } catch (err) {
    console.error("[monitoring-auth] request-link failed:", err instanceof Error ? err.message : err);
    return redirectTo(req, `${SIGN_IN_PATH}?error=unavailable`);
  }
}
