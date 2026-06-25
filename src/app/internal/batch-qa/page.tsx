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
  title: "Batch QA · Internal · GeoViz",
  robots: { index: false, follow: false },
};

export default async function BatchQaPage({
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

  // When cookie-authed (no ?key= in URL), use the server-side ADMIN_SECRET
  // so the client component can make authenticated API calls. Same effective
  // exposure as when the key is present in the URL.
  const adminKey = keyAuth ? (key as string) : (process.env.ADMIN_SECRET ?? "");
  const k = encodeURIComponent(adminKey);

  return (
    <InternalShell adminKey={adminKey}>
      <section className="container-page py-10">
        <header className="mb-8">
          <p className="section-eyebrow">Operator console · Batch QA</p>
          <h1 className="h2 mt-3">Batch QA runner</h1>
          <p className="muted mt-3 max-w-2xl">
            Paste business URLs (one per line) to run a QA batch through the
            worker pipeline. Each URL is queued as a calibration audit — no
            Stripe, no customer email. Per-URL signals: score, model failures,
            malformed text in raw report output, PDF pass/fail.
          </p>
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
            View all calibration rows →
          </Link>
        </div>
      </section>
    </InternalShell>
  );
}
