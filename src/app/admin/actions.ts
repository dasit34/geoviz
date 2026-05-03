"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ADMIN_COOKIE, getAdminPassword, isAuthed } from "@/lib/admin-auth";

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = getAdminPassword();

  if (!expected) {
    redirect("/admin?error=not_configured");
  }
  if (password !== expected) {
    redirect("/admin?error=invalid");
  }

  cookies().set(ADMIN_COOKIE, password, {
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
