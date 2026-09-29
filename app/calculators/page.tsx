import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import Provenance from "@/components/Provenance";
import CTAButton from "@/components/CTAButton";
import { CalcDisclaimer } from "@/components/calc/ShowWork";
import { copy } from "@/lib/copy";
import { CALC_LAST_UPDATED } from "@/lib/content/calculators";
import "@/components/calc/calc.css";

export const metadata: Metadata = {
  title: "Calculators",
  description: "Four deterministic mortgage calculators: points break-even, refinance break-even, rent vs. buy, and affordability. You enter the rate. LoanM8 displays none.",
  alternates: { canonical: "/calculators" },
};

export default function CalculatorsIndex() {
  const c = copy.calculators;
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Calculators", path: "/calculators" },
      ]}
    >
      <header className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-10 sm:pt-12 sm:pb-12">
        <p className="eyebrow mb-3">{c.eyebrow}</p>
        <h1 className="tagline text-4xl sm:text-6xl leading-tight mb-5">{c.heading}</h1>
        <p className="text-lg leading-relaxed font-light max-w-3xl" style={{ color: "var(--muted)" }}>
          {c.sub}
        </p>
        <p className="mono-label mt-5">{c.noRates}</p>
      </header>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12" aria-label="Calculators">
        <div className="calc-index-grid">
          {c.items.map((item) => (
            <Link key={item.slug} href={`/calculators/${item.slug}`} className="card calc-index-card">
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              <span className="calc-index-card__go">Open →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12" aria-labelledby="calc-more-h">
        <div className="card card--sunken flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div className="flex-1">
            <h2 id="calc-more-h" className="font-serif-display text-2xl mb-1" style={{ color: "var(--fg)" }}>
              {c.moreTools}
            </h2>
            <p className="calc-note">{c.moreToolsSub}</p>
          </div>
          <CTAButton href="/tools" variant="outline" icon="//">
            {c.moreTools}
          </CTAButton>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12">
        <div className="max-w-3xl flex flex-col gap-6">
          <CalcDisclaimer />
          <p className="calc-note">
            Formulas and assumptions for all four are published in plain text at{" "}
            <a href="/calculators/methodology.md" className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
              /calculators/methodology.md
            </a>
            .
          </p>
          <Provenance updated={CALC_LAST_UPDATED} />
        </div>
      </section>
    </PageShell>
  );
}
