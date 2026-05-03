import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReportView } from "@/components/ReportView";
import { generateVisibilityReport } from "@/lib/reporting/generateVisibilityReport";
import { integrityHomeExteriorsAudit } from "@/lib/reporting/sampleAudit";

export const metadata = {
  title: "Sample AI Visibility Report · GeoViz",
  description:
    "An example GeoViz AI Visibility Report. See exactly what you receive — your score, top issues, and ranked fixes.",
};

export default function SampleReportPage() {
  const report = generateVisibilityReport(integrityHomeExteriorsAudit);

  return (
    <main>
      <Header />

      <section className="relative border-b border-white/5">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-16">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="pill">Sample · For illustration</p>
              <h1 className="h2 mt-3">AI Visibility Report</h1>
              <p className="muted mt-3 max-w-xl">
                This is an example of what you receive after your audit. Real
                reports include your domain, your data, and ranked fixes
                tailored to your business.
              </p>
            </div>
            <Link href="/order" className="btn-primary">
              Get My Audit — $97
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="container-page py-16">
          <ReportView report={report} />
        </div>
      </section>

      <section>
        <div className="container-page py-20 text-center">
          <h2 className="h2 mx-auto max-w-2xl">
            Get your real AI Visibility Report.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl">
            Same format. Your domain. Your data. Ranked fixes you can hand
            straight to your developer — or have us implement.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/order" className="btn-primary">
              Get My Audit — $97
            </Link>
            <Link href="/" className="btn-ghost">
              Back to homepage
            </Link>
          </div>
          <p className="mt-3 text-xs italic text-white/50">
            We run a limited number of audits per day to keep results accurate.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
