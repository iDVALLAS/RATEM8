import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import JsonLd from "@/components/JsonLd";
import Provenance from "@/components/Provenance";
import CTAButton from "@/components/CTAButton";
import Reveal from "@/components/motion/Reveal";
import { AccentTitle } from "@/components/PrincipleCard";
import LoanEstimateGuide from "@/components/guide/LoanEstimateGuide";
import { leContent, leSections } from "@/lib/content/loan-estimate";
import { faqJsonLd, webPageJsonLd } from "@/lib/jsonld";
import "@/components/guide/guide.css";

const UPDATED = "2026-09-29";

export const metadata: Metadata = {
  title: leContent.metaTitle,
  description: leContent.metaDescription,
  alternates: { canonical: "/loan-estimate" },
};

/**
 * /loan-estimate — annotated Loan Estimate guide. Interactive mock form
 * (client) + plain-English notes, a static table of contents for
 * crawlers, FAQ with FAQPage JSON-LD, and a CTA into Second Look.
 */
export default function LoanEstimatePage() {
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Loan Estimate guide", path: "/loan-estimate" },
      ]}
    >
      <JsonLd
        data={[
          webPageJsonLd({
            path: "/loan-estimate",
            name: leContent.heading,
            description: leContent.metaDescription,
            dateModified: UPDATED,
          }),
          faqJsonLd([...leContent.faq]),
        ]}
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="le-hero">
          <p className="eyebrow">{leContent.eyebrow}</p>
          <Reveal as="h1" text={leContent.heading} accent={leContent.accent} underline immediate className="tagline mt-3 text-4xl sm:text-6xl" />
          <p className="le-hero__sub">{leContent.sub}</p>
          <nav aria-label="Sections of the form" className="mt-6">
            <ol className="flex flex-wrap gap-2">
              {leSections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#le-note-${sec.id}`} className="state-chip">
                    {String(sec.n).padStart(2, "0")} · {sec.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </header>

        <LoanEstimateGuide />

        <section aria-labelledby="le-faq-h" className="mt-16 max-w-3xl">
          <p className="eyebrow">{"// faq"}</p>
          <h2 id="le-faq-h" className="font-serif-display mt-2 text-3xl">
            {leContent.faqHeading}
          </h2>
          <div className="faq mt-6">
            {leContent.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p className="faq__a">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="le-cta-h" className="le-cta card card--sunken">
          <p className="eyebrow">{leContent.cta.eyebrow}</p>
          <h2 id="le-cta-h">
            <AccentTitle title={leContent.cta.title} accent={leContent.cta.accent} />
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-light" style={{ color: "var(--muted)" }}>
            {leContent.cta.body}
          </p>
          <div className="mt-6 max-w-md">
            <CTAButton href={leContent.cta.href} variant="primary" icon="LE">
              {leContent.cta.label}
            </CTAButton>
          </div>
        </section>

        <Provenance updated={UPDATED} className="mb-16" />
      </div>
    </PageShell>
  );
}
