import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <main>
      <Header />
      <section className="container-page py-24 text-center">
        <p className="pill">404</p>
        <h1 className="h2 mt-3">Page not found</h1>
        <p className="muted mx-auto mt-4 max-w-md">
          The page you’re looking for doesn’t exist. Try one of these instead.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="btn-primary">
            Homepage
          </Link>
          <Link href="/sample-report" className="btn-ghost">
            Sample report
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
