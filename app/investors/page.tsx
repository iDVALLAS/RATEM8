import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import Reveal from "@/components/motion/Reveal";
import CTAButton from "@/components/CTAButton";
import Orb from "@/components/Orb";
import { copy } from "@/lib/copy";
import { CONFIG } from "@/lib/config";
import "@/components/agents/agents.css";

/**
 * /investors — capital, strategic, and industry partners (v14, Edit 5b).
 *
 * Same pattern as /agents: orb hero, three cards, one CTA, fine print.
 * Every string is in `copy.investors`; the contact link is
 * `CONFIG.investorContactHref` (mailto today, swappable for a booking
 * link). No raise amount, valuation, terms, returns, or structure.
 */

export const metadata: Metadata = {
  title: copy.investors.metaTitle,
  description: copy.investors.metaDescription,
};

export default function InvestorsPage() {
  const c = copy.investors;
  return (
    <PageShell crumbs={[{ name: "Home", path: "/" }, { name: c.crumb, path: "/investors" }]}>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-16">
        <div className="max-w-3xl">
          <Orb size="ambient" px={72} className="block" />
          <p className="eyebrow mt-8">{c.eyebrow}</p>
          <Reveal as="h1" text={c.heading} accent={c.accent} immediate className="tagline mt-4 text-4xl leading-[1.05] sm:text-6xl" />
          <p className="mt-6 text-lg sm:text-xl leading-relaxed font-light" style={{ color: "var(--muted)" }}>
            {c.body}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          {c.cards.map((card) => (
            <article key={card.title} className="card">
              <h2 className="ag-card-title">{card.title}</h2>
              <p className="ag-card-body">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-16 sm:pt-14">
        <div className="max-w-sm">
          <CTAButton href={CONFIG.investorContactHref} variant="primary">
            {c.cta}
          </CTAButton>
        </div>
        <p className="mt-8 max-w-2xl text-xs leading-relaxed font-light" style={{ color: "var(--muted)" }}>
          {c.finePrint}
        </p>
      </section>
    </PageShell>
  );
}
