/* eslint-disable no-console */
/**
 * scripts/backfill-business-identity.ts
 *
 * One-shot backfill — links existing `AuditOrder` rows (businessId:
 * null) to a `Business` record, grouped by normalized domain. Part of
 * the Phase 1-2 monitoring foundation.
 *
 * Hard invariants:
 *
 *   • Only ever touches rows where `businessId` is currently null —
 *     never re-links or overwrites an already-linked row.
 *
 *   • Uses the exact same `findOrCreateBusinessForUrl()` the live
 *     order-creation path uses — no separate matching logic here.
 *
 *   • Deterministic only. `normalizeDomain()` either returns a domain
 *     or it doesn't — there is no fuzzy/"probably the same business"
 *     matching. A row whose `websiteUrl` doesn't normalize is skipped
 *     and reported, never guessed.
 *
 *   • Idempotent / safe to rerun: a `Business` row is looked up before
 *     being created, and only null-`businessId` rows are candidates,
 *     so a second run makes zero additional writes once everything
 *     resolvable has been linked.
 *
 * Usage (defaults to dry-run — this is less reversible than the
 * AuditIntelligence backfill, so unlike that script this one requires
 * an explicit flag to write):
 *
 *   npx tsx scripts/backfill-business-identity.ts                    (dry-run)
 *   npx tsx scripts/backfill-business-identity.ts --verbose          (dry-run, lists every skip)
 *   npx tsx scripts/backfill-business-identity.ts --limit=10         (dry-run, first 10 candidates)
 *   npx tsx scripts/backfill-business-identity.ts --force            (writes)
 *
 * Optional `--filter=<substring>` narrows to rows whose `websiteUrl`
 * contains the given substring (case-insensitive) — same convention as
 * `scripts/recover-stale-jobs.ts`. Used by
 * `scripts/test-business-linking.ts` to scope a real run to disposable
 * test fixtures instead of every unlinked row in production.
 */
import "./lib/require-nonprod-db-or-break-glass";
import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { normalizeDomain } from "../src/lib/business/normalize-domain";
import { findOrCreateBusinessForUrl } from "../src/lib/business/find-or-create-business";

const ARGS = new Set(process.argv.slice(2));
const RAW_ARGS = process.argv.slice(2);
const FORCE = ARGS.has("--force");
const VERBOSE = ARGS.has("--verbose");
const LIMIT = (() => {
  const flag = RAW_ARGS.find((a) => a.startsWith("--limit="));
  if (!flag) return undefined;
  const n = Number(flag.slice("--limit=".length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
})();
const FILTER = (() => {
  const flag = RAW_ARGS.find((a) => a.startsWith("--filter="));
  return flag ? flag.slice("--filter=".length) : null;
})();

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const mode = FORCE ? "WRITE" : "DRY-RUN";

  console.log(
    `[backfill-business] mode=${mode}${LIMIT ? ` limit=${LIMIT}` : ""} verbose=${VERBOSE}${FILTER ? ` filter="${FILTER}"` : ""}`,
  );
  if (!FORCE) {
    console.log(
      "[backfill-business] dry-run — no writes will be made. Pass --force to apply.",
    );
  }

  const where: Prisma.AuditOrderWhereInput = { businessId: null };
  if (FILTER) {
    where.websiteUrl = { contains: FILTER, mode: "insensitive" };
  }

  const candidates = await prisma.auditOrder.findMany({
    where,
    select: { id: true, websiteUrl: true },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
  });

  console.log(
    `[backfill-business] candidates: ${candidates.length} order(s) with businessId=null`,
  );

  let linked = 0;
  let unparseable = 0;
  const businessesTouched = new Set<string>();
  const unparseableSamples: Array<{ id: string; websiteUrl: string }> = [];

  for (const order of candidates) {
    const domain = normalizeDomain(order.websiteUrl);
    if (!domain) {
      unparseable += 1;
      unparseableSamples.push({ id: order.id, websiteUrl: order.websiteUrl });
      if (VERBOSE) {
        console.log(
          `[backfill-business] skip orderId=${order.id} reason=unparseable websiteUrl="${order.websiteUrl}"`,
        );
      }
      continue;
    }

    if (!FORCE) {
      // Dry-run: resolve what WOULD happen without writing. A plain
      // findUnique tells us whether this would reuse an existing
      // Business or create a new one, without calling the
      // find-or-create function's create() path.
      const existing = await prisma.business.findUnique({
        where: { normalizedDomain: domain },
        select: { id: true },
      });
      businessesTouched.add(existing?.id ?? `new:${domain}`);
      linked += 1;
      if (VERBOSE) {
        console.log(
          `[backfill-business] would-link orderId=${order.id} domain=${domain} business=${existing ? existing.id : "(new)"}`,
        );
      }
      continue;
    }

    const businessId = await findOrCreateBusinessForUrl(order.websiteUrl);
    if (!businessId) {
      // normalizeDomain() already succeeded above, so this should be
      // unreachable — but never silently skip an unexpected null.
      unparseable += 1;
      unparseableSamples.push({ id: order.id, websiteUrl: order.websiteUrl });
      continue;
    }
    await prisma.auditOrder.update({
      where: { id: order.id },
      data: { businessId },
    });
    businessesTouched.add(businessId);
    linked += 1;
    if (VERBOSE) {
      console.log(
        `[backfill-business] linked orderId=${order.id} domain=${domain} businessId=${businessId}`,
      );
    }
  }

  console.log("\n[backfill-business] ────── Summary ──────");
  console.log(`  Mode:                 ${mode}`);
  console.log(`  Candidates found:     ${candidates.length}`);
  console.log(`  ${FORCE ? "Linked" : "Would link"}:            ${linked}`);
  console.log(`  Unparseable (skipped): ${unparseable}`);
  console.log(`  Distinct businesses:  ${businessesTouched.size}`);

  if (unparseableSamples.length > 0) {
    console.log("\n  Unparseable rows (manual review needed):");
    const shown = VERBOSE ? unparseableSamples : unparseableSamples.slice(0, 10);
    for (const s of shown) {
      console.log(`    - orderId=${s.id} websiteUrl="${s.websiteUrl}"`);
    }
    if (!VERBOSE && unparseableSamples.length > shown.length) {
      console.log(
        `    ...and ${unparseableSamples.length - shown.length} more (rerun with --verbose to list all)`,
      );
    }
  }

  console.log(
    FORCE
      ? "\n[backfill-business] WRITE complete."
      : "\n[backfill-business] DRY-RUN complete — no rows were written.\n                     Re-run with --force to apply.",
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill-business] fatal error:", err);
  process.exit(1);
});
