import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import JsonLd from "@/components/JsonLd";
import Provenance from "@/components/Provenance";
import BookingCTA from "@/components/BookingCTA";
import Reveal from "@/components/motion/Reveal";
import SampleBrief from "@/components/brief/SampleBrief";
import { briefContent as c } from "@/lib/content/sample-brief";
import { webPageJsonLd } from "@/lib/jsonld";
import "@/components/brief/brief.css";

const UPDATED = "2026-09-29";

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
  alternates: { canonical: "/sample-brief" },
};

/**
 * /sample-brief — a sample Rate Strategy Brief rendered as a document
 * that opens on scroll. Fictional borrower, fictional figures, numbered
 * lenders, SAMPLE on every section.
 */
export default function SampleBriefPage() {
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Sample brief", path: "/sample-brief" },
      ]}
    >
      <JsonLd
        data={webPageJsonLd({
          path: "/sample-brief",
          name: c.metaTitle,
          description: c.metaDescription,
          dateModified: UPDATED,
        })}
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="br-banner mt-6" role="note">
          {c.banner}
        </p>

        <header className="br-hero">
          <p className="eyebrow">{c.eyebrow}</p>
          <Reveal as="h1" text={c.heading} accent={c.accent} underline immediate className="tagline mt-3 text-4xl sm:text-6xl" />
          <p className="br-hero__sub">{c.sub}</p>
        </header>

        <SampleBrief />

        <section aria-labelledby="br-cta-h" className="mt-12 card card--sunken">
          <p className="eyebrow">{c.ctaEyebrow}</p>
          <h2 id="br-cta-h" className="font-serif-display mt-2 text-3xl">
            {c.ctaHeading}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-light" style={{ color: "var(--muted)" }}>
            {c.ctaSub}
          </p>
          <div className="mt-6 max-w-md">
            <BookingCTA kind="borrower">{c.ctaLabel}</BookingCTA>
          </div>
        </section>

        <Provenance updated={UPDATED} className="mb-16" />
      </div>
    </PageShell>
  );
}
