/**
 * Monitoring customer login — server-side session lookups for pages and
 * route handlers. Every customer monitoring surface resolves the signed-in
 * customer here and reads ONLY subscriptions that customer owns.
 */
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

import type { MonitoringSubscriptionRecord } from "../types";
import { sessionCookieName } from "./http";
import { prismaMonitoringAuthStore } from "./prisma-auth-store";
import { resolveSessionCustomerId } from "./service";

/** The signed-in monitoring customer id, or null. */
export async function getSignedInCustomerId(): Promise<string | null> {
  const secret = cookies().get(sessionCookieName())?.value;
  if (!secret) return null;
  return resolveSessionCustomerId(secret, { store: prismaMonitoringAuthStore, now: () => new Date() });
}

export type OwnedSubscriptionResult =
  | { status: "ok"; customerId: string; sub: MonitoringSubscriptionRecord }
  | { status: "signed_out" }
  /** Unknown id OR owned by someone else — indistinguishable on purpose. */
  | { status: "not_found" };

/** Pure ownership rule (unit-tested): a customer sees only its own records. */
export function ownsSubscription(customerId: string, sub: Pick<MonitoringSubscriptionRecord, "customerId"> | null): boolean {
  return sub !== null && sub.customerId !== null && sub.customerId === customerId;
}

export async function requireOwnedSubscription(subscriptionId: unknown): Promise<OwnedSubscriptionResult> {
  const customerId = await getSignedInCustomerId();
  if (!customerId) return { status: "signed_out" };
  if (typeof subscriptionId !== "string" || !/^[a-z0-9]{10,40}$/i.test(subscriptionId)) return { status: "not_found" };
  const sub = await prisma.monitoringSubscription.findUnique({ where: { id: subscriptionId } });
  if (!ownsSubscription(customerId, sub)) return { status: "not_found" };
  return { status: "ok", customerId, sub: sub! };
}

/** Every business the customer monitors (newest first). */
export async function listCustomerSubscriptions(customerId: string): Promise<MonitoringSubscriptionRecord[]> {
  return prisma.monitoringSubscription.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
}
