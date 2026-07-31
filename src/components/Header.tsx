import Link from "next/link";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur">
      <div className="container-page flex h-20 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-white/70 lg:flex">
          <Link
            href="/#how-it-works"
            className="transition hover:text-white"
          >
            How it works
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
            Free AI Visibility Check
            <span className="pill border-accent/30 bg-accent/10 px-1.5 py-0 text-[9px] text-accent">
              Free
            </span>
          </Link>
          <Link href="/#pricing" className="transition hover:text-white">
            Pricing
          </Link>
          <Link href="/#faq" className="transition hover:text-white">
            FAQ
          </Link>
        </nav>
        <Link href="/order" className="btn-primary hidden text-sm lg:inline-flex">
          Run AI Visibility Audit
        </Link>
        <MobileNav />
      </div>
    </header>
  );
}
