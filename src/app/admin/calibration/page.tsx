import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CalibrationDashboard } from "@/components/CalibrationDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Operator Intelligence · Admin · GeoViz",
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
          <p className="section-eyebrow">Internal · Operator intelligence</p>
          <h1 className="h2 mt-3">GeoViz Operator Intelligence</h1>
          <p className="muted mt-3 max-w-2xl">
            The internal cockpit for active testing and calibration —
            today&rsquo;s audit volume, cost &amp; runtime telemetry,
            queue state, retry pressure, and expected-vs-actual score
            drift. Same audit pipeline, same scoring rubric, same
            worker queue customers hit. Calibration batch workflow is
            preserved end-to-end.
          </p>
          <p className="mt-3 text-xs text-white/55">
            Reviewing a paid customer order?{" "}
            <a
              href={`/admin/reports?key=${encodeURIComponent(key!)}`}
              className="text-accent hover:underline"
            >
              Open the customer reports dashboard →
            </a>
          </p>
        </header>
        <CalibrationDashboard adminKey={key!} />
      </section>
      <Footer />
    </main>
  );
}
