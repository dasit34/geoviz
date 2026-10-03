import Link from "next/link";

import { isMonitoringEnabled } from "@/lib/monitoring/plans";

import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";

export function Header() {
  // Monitoring sign-in is only linked once monitoring is open.
  const monitoringOpen = isMonitoringEnabled();
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur">
      <div className="container-page flex h-20 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-6 whitespace-nowrap text-sm text-white/70 lg:flex">
          <Link
            href="/#how-it-works"
            className="transition hover:text-white"
          >
            How it works
          </Link>
          <Link href="/#monitor" className="transition hover:text-white">
            Monitoring
          </Link>
          <Link
            href="/sample-report"
            className="transition hover:text-white"
          >
            Sample report
          </Link>
          <Link
            href="/check"
            className="inline-flex items-center gap-1.5 transition hover:text-white"
          >
            Free check
          </Link>
          <Link href="/#pricing" className="transition hover:text-white">
            Pricing
          </Link>
          <Link href="/#faq" className="transition hover:text-white">
            FAQ
          </Link>
          {monitoringOpen ? (
            <Link href="/monitoring/sign-in" className="transition hover:text-white">
              Sign in
            </Link>
          ) : null}
        </nav>
        <Link href="/order" className="btn-primary hidden whitespace-nowrap text-sm lg:inline-flex">
          Run AI Visibility Audit
        </Link>
        <MobileNav monitoringOpen={monitoringOpen} />
      </div>
    </header>
  );
}
