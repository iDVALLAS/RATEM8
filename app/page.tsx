import Link from "next/link";
import Footer from "@/components/Footer";

export const metadata = {
  title: "RateM8 — Coming soon",
  description: "RateM8 Loan Intelligence is being built. Preview the M8 demo by invitation.",
  robots: { index: false, follow: false },
};

/**
 * Coming-soon homepage during stealth launch.
 *
 * Per the v9 spec:
 *  - Quiet, brand-correct (breathing orb, single serif line)
 *  - Small "Preview the demo" link for friendly testers who have the password
 *  - Footer compliance disclosure stays (NMLS, Equal Housing) — this page
 *    is publicly accessible and a regulated entity's homepage has to carry
 *    those disclosures even in stealth
 *  - noindex, nofollow in metadata so search engines don't index it
 *
 * When NEXT_PUBLIC_STEALTH_MODE=false later, this file gets replaced by
 * the actual marketing homepage. For now, it IS the homepage.
 */
export default function ComingSoonPage() {
  return (
    <>
      <main className="relative grain min-h-screen flex flex-col">
        <header className="px-6 py-6">
          <div className="mx-auto max-w-7xl flex items-center justify-between">
            <span className="flex items-center gap-3">
              <span className="orb" style={{ width: 20, height: 20 }} />
              <span className="font-display font-medium tracking-tight text-lg">
                Rate<span style={{ color: "var(--color-m8-green)" }}>M8</span>
              </span>
            </span>
            <Link
              href="/demo"
              className="font-mono text-[10px] tracking-[0.18em] uppercase transition-colors"
              style={{ color: "var(--color-m8-green)" }}
            >
              Preview the demo →
            </Link>
          </div>
        </header>

        <section className="flex-1 px-6 py-20 flex flex-col items-center justify-center text-center">
          <div className="mb-14">
            <span className="orb" style={{ width: 180, height: 180 }} />
          </div>

          <p className="font-mono text-[11px] tracking-[0.2em] uppercase mb-6"
             style={{ color: "var(--color-m8-green)" }}>
            Loan Intelligence
          </p>

          <h1
            className="tagline text-5xl sm:text-7xl mb-10"
            style={{ maxWidth: "20ch" }}
          >
            M8 is being built.
          </h1>

          <p
            className="text-lg leading-relaxed max-w-md mx-auto font-light"
            style={{ color: "var(--muted)" }}
          >
            AI-powered mortgage rate shopping, built by an originator who
            closes every loan personally. Coming soon to Washington, Arizona,
            California, and Texas — with more states to follow.
          </p>

          <div className="mt-12 flex flex-col items-center gap-4">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-base transition-all"
              style={{
                background: "var(--color-m8-green)",
                color: "var(--color-m8-forest)",
              }}
            >
              Preview the M8 demo
              <span>→</span>
            </Link>
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase"
               style={{ color: "var(--muted)" }}>
              By invitation · Password required
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
