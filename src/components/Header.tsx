import Link from "next/link";
import { Logo } from "./Logo";

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
          <Link href="/#pricing" className="transition hover:text-white">
            Pricing
          </Link>
          <Link href="/#faq" className="transition hover:text-white">
            FAQ
          </Link>
        </nav>
        <Link href="/order" className="btn-primary text-sm">
          Run AI Visibility Audit
        </Link>
      </div>
    </header>
  );
}
