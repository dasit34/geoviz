import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CalibrationDashboard } from "@/components/CalibrationDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Calibration · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default function AdminCalibrationPage({
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
          <p className="section-eyebrow">Internal · Calibration harness</p>
          <h1 className="h2 mt-3">Score calibration</h1>
          <p className="muted mt-3 max-w-2xl">
            Queue many businesses through the live audit pipeline, store
            their category scores, and compare against a human-expected
            baseline. Each entry runs the same Anthropic prompt + worker
            queue + scoring rubric the real customers hit.
          </p>
        </header>
        <CalibrationDashboard adminKey={key!} />
      </section>
      <Footer />
    </main>
  );
}
