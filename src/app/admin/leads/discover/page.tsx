import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LeadDiscoveryForm } from "@/components/admin/LeadDiscoveryForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Find Leads · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default function AdminLeadDiscoveryPage({
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

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <header className="mb-8">
          <p className="section-eyebrow">Internal · Not customer-facing</p>
          <h1 className="h2 mt-3">Find New Leads</h1>
          <p className="muted mt-3 max-w-2xl">
            Discover businesses by industry and location. New leads
            land in the queue with status <code>NEW</code> — nothing
            is contacted or enriched automatically.
          </p>
          <p className="mt-3 text-xs text-white/55">
            <a
              href={`/admin/leads?key=${encodeURIComponent(key!)}`}
              className="text-accent hover:underline"
            >
              ← Back to Leads
            </a>
          </p>
        </header>
        <LeadDiscoveryForm adminKey={key!} />
      </section>
      <Footer />
    </main>
  );
}
