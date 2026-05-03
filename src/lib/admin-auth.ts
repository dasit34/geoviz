import { cookies } from "next/headers";

export const ADMIN_COOKIE = "geoviz_admin";

export function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

export function isAuthed(): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  const value = cookies().get(ADMIN_COOKIE)?.value;
  return Boolean(value) && value === expected;
}
