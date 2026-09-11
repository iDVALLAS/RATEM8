import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

/**
 * CalcLayout — page-level shell for a calculator.
 *
 * Renders Nav + tools-breadcrumb + title/lede + the calculator body
 * + the standard soft CTA to /demo + Footer. Every calculator page
 * consumes this so the visual rhythm is identical across all 12.
 *
 * Per v11 spec: single soft CTA at the bottom linking to /demo.
 * No urgency, no pressure. "Want to talk this through with M8?".
 */
export default function CalcLayout({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />

      <main className="min-h-screen">
        <section className="border-b" style={{ borderColor: "var(--rule)" }}>
          <div className="mx-auto max-w-4xl px-6 py-16">
            <p
              className="font-mono text-[11px] tracking-[0.2em] uppercase mb-4"
              style={{ color: "var(--accent)" }}
            >
              <Link
                href="/tools"
                className="hover:underline"
                style={{ color: "inherit" }}
              >
                Tools
              </Link>
              {" · "}
              {eyebrow}
            </p>
            <h1 className="tagline text-4xl sm:text-5xl leading-tight mb-6">
              {title}
            </h1>
            <p
              className="text-lg leading-relaxed font-light max-w-2xl"
              style={{ color: "var(--muted)" }}
            >
              {lede}
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-4xl px-6 py-12">{children}</div>
        </section>

        <section
          className="border-t"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <p
              className="font-display text-2xl sm:text-3xl mb-6"
              style={{ color: "var(--fg)" }}
            >
              Want to talk this through with M8?
            </p>
            <p
              className="text-sm mb-8 max-w-xl mx-auto font-light"
              style={{ color: "var(--muted)" }}
            >
              These calculators run generic math on the numbers you type.
              M8 can look at your actual situation — credit, DTI, timeline
              — and tell you what's actually smart for you.
            </p>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-base transition-all"
              style={{
                background: "var(--accent)",
                color: "var(--accent-text)",
              }}
            >
              Chat with M8
              <span>→</span>
            </Link>
            <p
              className="mt-6 font-mono text-[10px] tracking-[0.15em] uppercase"
              style={{ color: "var(--muted)" }}
            >
              Preview build · Password required · Compliance review pending
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
