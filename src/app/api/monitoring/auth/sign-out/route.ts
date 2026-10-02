import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  SIGN_IN_PATH,
  clearedSessionCookieOptions,
  forbiddenOriginResponse,
  isSameOriginRequest,
  redirectTo,
  sessionCookieName,
} from "@/lib/monitoring/auth/http";
import { prismaMonitoringAuthStore } from "@/lib/monitoring/auth/prisma-auth-store";
import { signOut } from "@/lib/monitoring/auth/service";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const runtime = "nodejs";

/** Revokes this browser's session server-side and clears the cookie. */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginRequest(req)) return forbiddenOriginResponse();

  try {
    await signOut(cookies().get(sessionCookieName())?.value, { store: prismaMonitoringAuthStore, now: () => new Date() });
  } catch (err) {
    console.error("[monitoring-auth] sign-out revoke failed:", err instanceof Error ? err.message : err);
  }
  const res = redirectTo(req, `${SIGN_IN_PATH}?signed_out=1`);
  res.cookies.set(sessionCookieName(), "", clearedSessionCookieOptions());
  return res;
}
