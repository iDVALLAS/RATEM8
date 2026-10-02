import PageShell from "@/components/PageShell";
import CTAButton from "@/components/CTAButton";
import BookingCTA from "@/components/BookingCTA";
import ApplyCta from "@/components/mlo/ApplyCta";
import Link from "next/link";
import Provenance from "@/components/Provenance";
import Faq from "@/components/calc/Faq";
import { copy } from "@/lib/copy";
import { MloText } from "@/components/mlo/MloContext";
import { CALC_CONTENT, CALC_LAST_UPDATED, type CalcSlug } from "@/lib/content/calculators";
import "./calc.css";

/**
 * CalcPage — the shared server-rendered wrapper for one calculator.
 *
 * PageShell (Home → Calculators → name) · h1 · lede · no-rates line ·
 * the client calculator body (children) · FAQ + FAQPage JSON-LD ·
 * last-updated · soft CTA row · Provenance.
 *
 * The body renders its own results, disclaimer, "Show your work" panel,
 * and assumptions list, because those depend on the live result.
 */
export default function CalcPage({ slug, children }: { slug: CalcSlug; children: React.ReactNode }) {
  const c = CALC_CONTENT[slug];
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Calculators", path: "/calculators" },
        { name: c.title, path: `/calculators/${slug}` },
      ]}
    >
      <header className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-8 sm:pt-12 sm:pb-10">
        <p className="eyebrow mb-3">{copy.calculators.eyebrow}</p>
        <h1 className="tagline text-4xl sm:text-5xl leading-tight mb-5">{c.title}</h1>
        <p className="text-lg leading-relaxed font-light max-w-3xl" style={{ color: "var(--muted)" }}>
          {c.lede}
        </p>
        <p className="mono-label mt-5">{copy.calculators.noRates}</p>
      </header>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12" aria-label={`${c.title} calculator`}>
        {children}
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12">
        <div className="max-w-3xl">
          <Faq items={c.faq} />
          <p className="mono-label mt-6">
            {copy.calculators.lastUpdated} <time dateTime={CALC_LAST_UPDATED}>{CALC_LAST_UPDATED}</time>
          </p>
        </div>
      </section>

      <section className="border-t" style={{ borderColor: "var(--rule)" }} aria-labelledby="calc-cta-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
          <h2 id="calc-cta-h" className="font-serif-display text-2xl sm:text-3xl mb-3" style={{ color: "var(--fg)" }}>
            {copy.calculators.ctaTitle}
          </h2>
          <p className="calc-note max-w-2xl mb-6"><MloText generic={copy.calculators.ctaBody} named={copy.calculators.ctaBodyNamed} /></p>
          <div className="calc-cta">
            <CTAButton href="/chat" variant="secondary">
              {copy.calculators.ctaChat}
            </CTAButton>
            <BookingCTA kind="borrower" variant="pill">
              {copy.calculators.ctaBook}
            </BookingCTA>
          </div>
          {/* v18: the matched MLO's application, or the state picker first; then M8 prep. */}
          <div className="mt-4 max-w-md">
            <ApplyCta variant="outline" />
            <Link href={copy.apply.prepHref} className="next-step__prep">
              {copy.apply.prepLink}
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-12">
        <Provenance updated={CALC_LAST_UPDATED} />
      </div>
    </PageShell>
  );
}
