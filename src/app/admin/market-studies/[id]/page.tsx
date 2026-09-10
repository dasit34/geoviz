import { notFound } from "next/navigation";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { isAdminPageRequest, isValidAdminKey } from "@/lib/admin-secret";
import { MarketStudyDetail } from "@/components/admin/MarketStudyDetail";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Market Study · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminMarketStudyDetailPage({
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
        </section>
        <Footer />
      </main>
    );
  }

  const key =
    isValidAdminKey(rawKeyStr) && rawKeyStr
      ? rawKeyStr
      : (process.env.ADMIN_SECRET ?? "");

  const exists = await prisma.marketStudy.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!exists) notFound();

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <p className="section-eyebrow">
          <a
            href={`/admin/market-studies?key=${encodeURIComponent(key)}`}
            className="hover:text-accent hover:underline"
          >
            ← Market Studies
          </a>
        </p>
        <MarketStudyDetail adminKey={key} studyId={params.id} />
      </section>
      <Footer />
    </main>
  );
}
