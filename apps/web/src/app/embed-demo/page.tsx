import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";

export const metadata: Metadata = { title: "Patty & Co. | Sample restaurant website (demo)" };

// Stands in for a restaurant's own website so you can see the embed working.
// It is styled differently from the ordering app on purpose: it's "their" site.
export default function EmbedDemoPage() {
  return (
    <div className="min-h-dvh bg-[#fdfaf6] text-char">
      <p className="bg-char px-4 py-2 text-center text-sm text-white">
        Sample website for testing the embed. Patty &amp; Co. is fictional.{" "}
        <Link href="/admin" className="font-bold underline">
          Back to settings
        </Link>
      </p>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-extrabold tracking-tight">Patty &amp; Co.</span>
        <nav aria-label="Site" className="hidden gap-6 text-char-soft sm:flex">
          <span>Menu</span>
          <span>Locations</span>
          <span>About</span>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl gap-10 px-6 pt-10 pb-20 md:grid-cols-[1.3fr_1fr] md:items-end">
          <div>
            <h1 className="font-display text-6xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
              Smashed burgers, made to order.
            </h1>
            <p className="mt-6 max-w-md text-lg text-char-soft">
              Burgers, crispy chicken and thickshakes from a shop that doesn&apos;t exist. Tap &ldquo;Order online&rdquo; in the
              corner to try the ordering assistant.
            </p>
          </div>
          <div className="rounded-3xl bg-bun-soft p-6">
            <h2 className="font-display text-xl font-bold">Hours</h2>
            <dl className="mt-3 space-y-1">
              <div className="flex justify-between"><dt>Mon–Thu</dt><dd>10:30 – 21:00</dd></div>
              <div className="flex justify-between"><dt>Fri–Sat</dt><dd>10:30 – 23:00</dd></div>
              <div className="flex justify-between"><dt>Sun</dt><dd>11:00 – 20:00</dd></div>
            </dl>
            <h2 className="mt-6 font-display text-xl font-bold">Find us</h2>
            <address className="mt-2 not-italic text-char-soft">
              123 Example Street
              <br />
              Sampletown NSW 2000
            </address>
          </div>
        </section>
      </main>

      <Script src="/embed.js" data-restaurant="demo" strategy="afterInteractive" />
    </div>
  );
}
