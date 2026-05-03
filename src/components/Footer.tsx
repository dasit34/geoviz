import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-ink-950/70">
      <div className="container-page flex flex-col items-start justify-between gap-6 py-10 text-sm text-white/50 md:flex-row md:items-center">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-md">
            GeoViz audits whether AI tools recommend your business. We deliver a
            full visibility report by email — typically within 24 hours.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex gap-5">
            <Link href="/sample-report" className="hover:text-white">
              Sample report
            </Link>
            <Link href="/order" className="hover:text-white">
              Order
            </Link>
          </div>
          <p>© {new Date().getFullYear()} GeoViz. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
