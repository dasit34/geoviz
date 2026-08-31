import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { LeadListsPanel } from "@/components/admin/LeadListsPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Lead Lists · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminLeadListsPage({
  searchParams,
}: {
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

  const lists = await prisma.leadList.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { memberships: true } } },
  });

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <header className="mb-8">
          <p className="section-eyebrow">Internal · Not customer-facing</p>
          <h1 className="h2 mt-3">Lead Lists</h1>
          <p className="muted mt-3 max-w-2xl">
            Campaign-style groupings — e.g. &ldquo;Columbus HVAC&rdquo;,
            &ldquo;Toledo Roofers&rdquo; — for organizing outreach. A lead can
            belong to any number of lists.
          </p>
          <p className="mt-3 text-xs text-white/55">
            <Link href={`/admin/leads?key=${encodeURIComponent(key!)}`} className="text-accent hover:underline">
              ← Back to Leads
            </Link>
          </p>
        </header>
        <LeadListsPanel
          adminKey={key!}
          initialLists={lists.map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            createdAt: l.createdAt,
            memberCount: l._count.memberships,
          }))}
        />
      </section>
      <Footer />
    </main>
  );
}
