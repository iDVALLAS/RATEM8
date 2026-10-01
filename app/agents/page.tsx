import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import Reveal from "@/components/motion/Reveal";
import BookingCTA from "@/components/BookingCTA";
import Provenance from "@/components/Provenance";
import StalledDeal from "@/components/agents/StalledDeal";
import { copy } from "@/lib/copy";
import { MloText } from "@/components/mlo/MloContext";
import { agentsContent } from "@/lib/content/agents";

/**
 * /agents — the real estate agent partnership page.
 *
 * Copy comes from `copy.agentsPage` and `copy.agents` (locked) plus the
 * structural strings in `lib/content/agents.ts`. Facts come from
 * config. Nothing here names a person (unless MloContext has a match),
 * a count, a rate, or a timeline.
 *
 * Money: none flows between LoanM8 and agents. The page says so twice,
 * once in the sections and once as the pull-quote.
 *
 * Co-branded pages are described as a future feature only. Nothing is
 * built for them here and there is nothing to sign up for.
 */

export const metadata: Metadata = {
  title: agentsContent.metaTitle,
  description: agentsContent.metaDescription,
};

export default function AgentsPage() {
  const page = copy.agentsPage;
  const band = copy.agents;
  const h = agentsContent.headings;
  const moneySection = page.sections[3];

  return (
    <PageShell crumbs={[...agentsContent.crumbs]}>
      {/* ─── Hero ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-16">
        <div className="max-w-3xl">
          <p className="eyebrow">{page.eyebrow}</p>
          <Reveal as="h1" text={band.heading} accent="unsticks them." immediate className="tagline mt-4 text-4xl leading-[1.05] sm:text-6xl" />
          <p className="mt-6 text-lg sm:text-xl leading-relaxed font-light" style={{ color: "var(--muted)" }}>
            {page.sub}
          </p>
        </div>
      </section>

      {/* ─── Centerpiece: a stalled deal that unsticks ─── */}
      <StalledDeal />

      {/* ─── The partnership, in four parts ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-6 sm:pt-24">
        <p className="code-label">{h.partnershipEyebrow}</p>
        <h2 className="ag-section-title">{h.partnership}</h2>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {page.sections.map((s, i) => (
            <article key={s.title} className="card">
              <h3 className="ag-card-title">
                {s.title}
                {i === 2 ? <span className="ag-later">coming later</span> : null}
              </h3>
              <p className="ag-card-body">{"bodyNamed" in s ? <MloText generic={s.body} named={s.bodyNamed} /> : s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ─── How this works ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <div className="card card--sunken ag-how">
          <h2 className="ag-card-title">{page.howBox.title}</h2>
          <ol>
            {page.howBox.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── Money, plainly ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">
        <p className="code-label">{h.quoteEyebrow}</p>
        <blockquote className="ag-quote mt-4 max-w-3xl">{moneySection.body}</blockquote>
      </section>

      {/* ─── What your buyer gets ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <p className="code-label">{h.buyersEyebrow}</p>
        <h2 className="ag-section-title">{h.buyers}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {band.cards.map((c) => (
            <article key={c.title} className="card">
              <h3 className="ag-card-title">{c.title}</h3>
              <p className="ag-card-body">{"bodyNamed" in c ? <MloText generic={c.body} named={c.bodyNamed} /> : c.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-16 sm:pt-20">
        <div className="dashed-box p-5 sm:p-8 md:grid md:grid-cols-[1.2fr_1fr] md:items-center md:gap-10">
          <div>
            <p className="code-label">{h.ctaEyebrow}</p>
            <h2 className="ag-section-title">{h.ctaTitle}</h2>
            <p className="ag-card-body mt-3 max-w-md">{h.ctaSub}</p>
          </div>
          <div className="mt-6 md:mt-0">
            <BookingCTA kind="agent">{page.cta}</BookingCTA>
          </div>
        </div>

        <Provenance updated="2026-09-29" />
      </section>
    </PageShell>
  );
}
