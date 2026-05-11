import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-ink-950/70">
      <div className="container-page flex flex-col items-start justify-between gap-6 py-10 text-sm text-white/50 md:flex-row md:items-center">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-md">
            GeoViz audits how AI search platforms read, trust, and
            recommend your business. Full scored report delivered by
            email — typically within minutes.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap gap-x-5 gap-y-2 md:justify-end">
            <Link href="/sample-report" className="hover:text-white">
              Sample report
            </Link>
            <Link href="/order" className="hover:text-white">
              Order
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 md:justify-end">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/refund-policy" className="hover:text-white">
              Refund policy
            </Link>
            <a
              href="mailto:support@geoviz.ai"
              className="hover:text-white"
            >
              Contact
            </a>
          </div>
          <p>© {new Date().getFullYear()} GeoViz. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
