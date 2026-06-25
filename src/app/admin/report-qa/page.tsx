import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReportQaPage } from "@/components/admin/ReportQaPage";
import {
  logReportAccessAttempt,
  validateAdminAccess,
} from "@/lib/report-access";
import { isAuthed } from "@/lib/admin-auth";
import { checkPageRateLimit } from "@/lib/rate-limit";
import { RateLimitedNotice } from "@/components/RateLimitedNotice";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Report QA · Admin · GeoViz",
  robots: { index: false, follow: false },
};

export default async function AdminReportQaPage({
  searchParams,
}: {
  searchParams?: { key?: string | string[] };
}) {
  const rl = checkPageRateLimit({
    headers: headers(),
    routeKey: "page:admin:report-qa",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (rl.blocked) {
    return <RateLimitedNotice retryAfterSec={rl.retryAfterSec} />;
  }

  // Accept either key auth (?key=ADMIN_SECRET) or cookie auth (from /admin dashboard).
  const rawKey = searchParams?.key;
  const access = validateAdminAccess(rawKey);
  const cookieAuth = isAuthed();

  if (!access.ok && !cookieAuth) {
    logReportAccessAttempt({
      route: "/admin/report-qa",
      outcome: "blocked",
      reason: access.reason,
      expectedLength: access.expectedLength,
      receivedLength: access.receivedLength,
    });
    return <UnauthorizedPage />;
  }

  // Resolve the admin key: prefer the supplied key, fall back to env var.
  const rawKeyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  const adminKey =
    access.ok && rawKeyStr ? rawKeyStr : (process.env.ADMIN_SECRET ?? "");

  return (
    <main>
      <Header />
      <section className="container-page py-10">
        <header className="mb-8">
          <p className="section-eyebrow">Admin · Report QA</p>
          <h1 className="h2 mt-3">Report QA</h1>
          <p className="muted mt-3 max-w-2xl">
            Review and validate report templates against existing calibration
            audits. Re-check renders HTML and regenerates PDFs from stored audit
            data — no new LLM calls, no new audit records.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/50">
            <span className="pill bg-white/5">0 LLM calls per re-check</span>
            <span className="pill bg-white/5">read-only audit data</span>
            <span className="pill bg-white/5">review workflow</span>
            <span className="pill bg-white/5">CSV export</span>
          </div>
        </header>

        <ReportQaPage adminKey={adminKey} />
      </section>
      <Footer />
    </main>
  );
}

function UnauthorizedPage() {
  return (
    <main>
      <Header />
      <section className="container-page py-20 text-center">
        <p className="h3">Access denied</p>
        <p className="muted mt-3 text-sm">
          Add <code className="pill bg-white/5">?key=ADMIN_SECRET</code> to the
          URL or sign in at{" "}
          <a href="/admin" className="text-accent hover:underline">
            /admin
          </a>
          .
        </p>
      </section>
      <Footer />
    </main>
  );
}
