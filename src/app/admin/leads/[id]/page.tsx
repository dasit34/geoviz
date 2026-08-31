import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { LeadDetailPanel } from "@/components/admin/LeadDetailPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Lead Detail · Admin · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Lead detail page — server component, `?key=` gated like every other
 * admin/leads page. Direct Prisma fetch (no new GET API route needed,
 * matching /admin/leads's own bounded-fetch pattern); interactive
 * editing/actions happen in the client `<LeadDetailPanel>`.
 */
export default async function AdminLeadDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { key?: string | string[] };
}) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const rawKey = searchParams?.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <h1 className="h2">Unauthorized</h1>
          <p className="muted mt-3 max-w-xl">
            This page requires an admin key. Append{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">?key=…</code>{" "}
            to the URL.
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      sourceRefs: { orderBy: { discoveredAt: "asc" } },
      freeCheckSubmission: true,
      auditOrder: { select: { id: true, paymentStatus: true, auditStatus: true, reportStatus: true } },
      business: { select: { id: true, normalizedDomain: true } },
      listMemberships: { include: { leadList: true }, orderBy: { addedAt: "desc" } },
    },
  });

  if (!lead) notFound();

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <header className="mb-8">
          <p className="section-eyebrow">Internal · Not customer-facing</p>
          <h1 className="h2 mt-3">{lead.businessName}</h1>
          <p className="mt-3 text-xs text-white/55">
            <Link href={`/admin/leads?key=${encodeURIComponent(key!)}`} className="text-accent hover:underline">
              ← Back to Leads
            </Link>
          </p>
        </header>
        <LeadDetailPanel adminKey={key!} lead={lead} />
      </section>
      <Footer />
    </main>
  );
}
