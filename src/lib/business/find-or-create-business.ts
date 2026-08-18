import { prisma } from "@/lib/db";
import { normalizeDomain } from "./normalize-domain";

/**
 * Resolves the durable Business identity for a raw website URL,
 * creating one if this is the first time this domain has been seen.
 * Returns null when the URL doesn't normalize to a domain (invalid/
 * unparseable) — callers must treat that as "no business link," never
 * guess one.
 *
 * The single call site for this logic — do not duplicate a
 * find-or-create against `normalizedDomain` anywhere else. Both
 * `createAuditOrderFromCheckoutSession` and
 * `scripts/backfill-business-identity.ts` call this same function.
 */
export async function findOrCreateBusinessForUrl(
  rawUrl: string,
): Promise<string | null> {
  const domain = normalizeDomain(rawUrl);
  if (!domain) return null;

  const existing = await prisma.business.findUnique({
    where: { normalizedDomain: domain },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await prisma.business.create({
      data: { normalizedDomain: domain, primaryWebsiteUrl: rawUrl },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : null;
    if (code === "P2002") {
      // Race: a concurrent order for the same brand-new domain won.
      // The unique constraint on normalizedDomain is the source of
      // truth here — re-fetch rather than fail this caller.
      const winner = await prisma.business.findUnique({
        where: { normalizedDomain: domain },
        select: { id: true },
      });
      return winner?.id ?? null;
    }
    throw err;
  }
}
