import Link from "next/link";
import { isValidAdminKey } from "@/lib/admin-secret";
import { isAuthed } from "@/lib/admin-auth";
import { BatchQaRunner } from "@/components/internal/BatchQaRunner";
import {
  InternalShell,
  InternalUnauthorized,
} from "@/components/internal/InternalShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Launch QA · Internal · GeoViz",
  robots: { index: false, follow: false },
};

export default async function LaunchQaPage({
  searchParams,
}: {
  searchParams?: { key?: string | string[] };
}) {
  const rawKey = searchParams?.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  const keyAuth = isValidAdminKey(key);
  const cookieAuth = isAuthed();

  if (!keyAuth && !cookieAuth) {
    return <InternalUnauthorized />;
  }

  const adminKey = keyAuth ? (key as string) : (process.env.ADMIN_SECRET ?? "");
  const k = encodeURIComponent(adminKey);

  return (
    <InternalShell adminKey={adminKey}>
      <section className="container-page py-10">
        <header className="mb-8">
          <p className="section-eyebrow">Operator console · Launch QA</p>
          <h1 className="h2 mt-3">URL batch testing</h1>
          <p className="muted mt-3 max-w-2xl">
            Paste up to 50 business URLs (one per line). Each is queued as a
            calibration audit — no Stripe, no customer email. The table tracks
            score, page count, PDF generation, model failures, category
            fallbacks, and malformed text so recurring failures are visible in
            one place.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/50">
            <span className="pill bg-white/5">no Stripe</span>
            <span className="pill bg-white/5">no customer email</span>
            <span className="pill bg-white/5">max 2 concurrent PDFs</span>
            <span className="pill bg-white/5">CSV export</span>
          </div>
        </header>

        <BatchQaRunner adminKey={adminKey} />

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/internal?key=${k}`}
            className="text-accent hover:underline"
          >
            ← Back to dashboard
          </Link>
          <Link
            href={`/admin/calibration?key=${k}`}
            className="text-white/60 hover:text-white"
          >
            View calibration rows →
          </Link>
        </div>
      </section>
    </InternalShell>
  );
}
