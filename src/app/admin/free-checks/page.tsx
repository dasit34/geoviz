import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { isAuthed } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Free Check Submissions · Admin · GeoViz",
  robots: { index: false, follow: false },
};

type Submission = {
  id: string;
  createdAt: Date;
  businessName: string;
  websiteUrl: string;
  email: string;
  status: string;
  overallScore: number | null;
};

/**
 * Simple admin visibility for /check submissions. Purchase attribution
 * is computed here at read time — an email + created-after match
 * against AuditOrder — rather than a stored foreign key. This keeps
 * the Stripe checkout/webhook code paths (load-bearing per CLAUDE.md)
 * completely untouched by this feature.
 */
export default async function AdminFreeChecksPage() {
  if (!isAuthed()) {
    return (
      <main>
        <Header />
        <section className="container-page py-24 text-center">
          <p className="pill">Admin</p>
          <h1 className="h2 mt-3">Sign in required</h1>
          <p className="muted mt-3 text-sm">
            <Link href="/admin" className="text-accent hover:underline">
              Go to admin sign-in
            </Link>
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  let submissions: Submission[] = [];
  let purchasedEmails = new Set<string>();
  let dbError: string | null = null;

  if (!isDatabaseConfigured()) {
    dbError = "DATABASE_URL is not set.";
  } else {
    try {
      submissions = await prisma.freeCheckSubmission.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          createdAt: true,
          businessName: true,
          websiteUrl: true,
          email: true,
          status: true,
          overallScore: true,
        },
      });

      const emails = [...new Set(submissions.map((s) => s.email))];
      if (emails.length > 0) {
        const paidOrders = await prisma.auditOrder.findMany({
          where: { email: { in: emails }, paymentStatus: "paid" },
          select: { email: true, createdAt: true },
        });
        // A submission counts as "purchased" when a paid order for the
        // same email exists, created at or after the free check. Loose
        // but safe — email is the only signal we have without touching
        // checkout/webhook code.
        purchasedEmails = new Set(
          submissions
            .filter((s) =>
              paidOrders.some(
                (o) => o.email === s.email && o.createdAt >= s.createdAt,
              ),
            )
            .map((s) => s.id),
        );
      }
    } catch (err) {
      console.error("[admin/free-checks] DB query failed", err);
      dbError =
        "Could not connect to the database. Check DATABASE_URL and that the schema has been pushed.";
    }
  }

  return (
    <main>
      <Header />
      <section className="container-page py-12">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="pill">Admin · Free Check</p>
            <h1 className="h2 mt-3">Free check submissions</h1>
            <p className="muted mt-2 text-sm">
              Most recent first. Purchase status is matched by email against
              paid audit orders.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost text-sm">
            Back to orders
          </Link>
        </div>

        {dbError ? (
          <div
            role="alert"
            className="mt-8 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
          >
            {dbError}
          </div>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-lg border border-white/10 bg-ink-900/60">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.18em] text-white/50">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Website</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Purchase status</th>
              </tr>
            </thead>
            <tbody>
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-white/50">
                    {dbError ? "Database not available." : "No submissions yet."}
                  </td>
                </tr>
              ) : null}
              {submissions.map((s) => (
                <tr key={s.id} className="border-t border-white/5 align-top">
                  <td className="px-5 py-4 text-white/70 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-white/80">{s.businessName}</td>
                  <td className="px-5 py-4">
                    <a
                      href={s.websiteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-white hover:text-accent"
                    >
                      {s.websiteUrl}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-white/80">{s.email}</td>
                  <td className="px-5 py-4 text-white/80">
                    {s.status === "completed" && s.overallScore !== null
                      ? s.overallScore
                      : "—"}
                  </td>
                  <td className="px-5 py-4">
                    {purchasedEmails.has(s.id) ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        Purchased
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-xs text-white/50">
                        Not yet
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Footer />
    </main>
  );
}
