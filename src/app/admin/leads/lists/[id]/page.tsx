import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { LeadsTable } from "@/components/admin/LeadsTable";
import { LeadListHeaderActions } from "@/components/admin/LeadListHeaderActions";
import { isAdminPageRequest, isValidAdminKey } from "@/lib/admin-secret";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Lead List · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminLeadListDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { key?: string | string[] };
}) {
  const rawKey = searchParams?.key;
  const rawKeyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!isAdminPageRequest({ key: rawKey })) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <h1 className="h2">Unauthorized</h1>
          <p className="muted mt-3 max-w-xl">
            Add <code className="rounded bg-white/10 px-1.5 py-0.5">?key=ADMIN_SECRET</code>{" "}
            to the URL, or sign in at{" "}
            <a href="/admin" className="text-accent hover:underline">/admin</a>.
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  const key = isValidAdminKey(rawKeyStr) && rawKeyStr
    ? rawKeyStr
    : (process.env.ADMIN_SECRET ?? "");

  const list = await prisma.leadList.findUnique({
    where: { id: params.id },
    include: {
      memberships: { orderBy: { addedAt: "desc" }, include: { lead: true } },
    },
  });
  if (!list) notFound();

  const leads = list.memberships.map((m) => m.lead);

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-eyebrow">Internal · Not customer-facing</p>
            <h1 className="h2 mt-3">{list.name}</h1>
            {list.description ? <p className="muted mt-2 max-w-2xl">{list.description}</p> : null}
            <p className="mt-3 text-xs text-white/55">
              <Link href={`/admin/leads/lists?key=${encodeURIComponent(key!)}`} className="text-accent hover:underline">
                ← All Lists
              </Link>
            </p>
          </div>
          <LeadListHeaderActions
            adminKey={key!}
            listId={list.id}
            initialName={list.name}
            initialDescription={list.description}
          />
        </header>
        <LeadsTable adminKey={key!} initialLeads={leads} leadListId={list.id} />
      </section>
      <Footer />
    </main>
  );
}
