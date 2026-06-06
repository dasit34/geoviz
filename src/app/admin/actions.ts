"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  ADMIN_COOKIE,
  adminCookieToken,
  getAdminPassword,
  isAuthed,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { checkRateLimit, clientIpHashFromHeaders } from "@/lib/rate-limit";

// Brute-force guard on the admin login. In-memory / per-instance (same
// limiter the public routes use) — meaningfully raises the bar for a single
// operator's login without a Redis dependency. Counts every attempt.
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 15 * 60_000;

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = getAdminPassword();

  if (!expected) {
    redirect("/admin?error=not_configured");
  }

  // `headers()` returns a ReadonlyHeaders; the limiter only calls `.get()`.
  const ipHash = clientIpHashFromHeaders(headers() as unknown as Headers);
  const limited = checkRateLimit(
    `admin:login:${ipHash}`,
    LOGIN_LIMIT,
    LOGIN_WINDOW_MS,
  );
  if (!limited.allowed) {
    console.warn(
      `[admin-login] rate-limited ipHash=${ipHash} retryAfterSec=${limited.retryAfterSec}`,
    );
    redirect("/admin?error=rate_limited");
  }

  if (!verifyAdminPassword(password)) {
    redirect("/admin?error=invalid");
  }

  const token = adminCookieToken();
  if (!token) {
    redirect("/admin?error=not_configured");
  }

  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });

  redirect("/admin");
}

export async function logoutAction() {
  cookies().delete(ADMIN_COOKIE);
  redirect("/admin");
}

export async function markCompletedAction(formData: FormData) {
  if (!isAuthed()) redirect("/admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.auditOrder.update({
    where: { id },
    data: { auditStatus: "completed" },
  });
  revalidatePath("/admin");
}

export async function markPendingAction(formData: FormData) {
  if (!isAuthed()) redirect("/admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.auditOrder.update({
    where: { id },
    data: { auditStatus: "pending" },
  });
  revalidatePath("/admin");
}

export async function updateNotesAction(formData: FormData) {
  if (!isAuthed()) redirect("/admin");
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!id) return;
  await prisma.auditOrder.update({
    where: { id },
    data: { notes },
  });
  revalidatePath("/admin");
}
