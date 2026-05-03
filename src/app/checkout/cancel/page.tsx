import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Checkout cancelled · GeoViz",
  robots: { index: false, follow: false },
};

export default function CheckoutCancelPage() {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-24">
          <div className="mx-auto max-w-xl text-center">
            <p className="pill">Checkout cancelled</p>
            <h1 className="h2 mt-4">No charge was made.</h1>
            <p className="muted mt-4">
              If something didn’t look right or you have a question before
              ordering, just reply to your audit email or restart the order
              when you’re ready.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/order" className="btn-primary">
                Try again
              </Link>
              <Link href="/" className="btn-ghost">
                Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
