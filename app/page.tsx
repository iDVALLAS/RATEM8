import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Orb from "@/components/Orb";
import OrbFlowField from "@/components/OrbFlowField";
import CTAButton from "@/components/CTAButton";
import PrincipleCard from "@/components/PrincipleCard";
import { copy } from "@/lib/copy";
import { principles } from "@/lib/principles";
import { ANCHOR_LO, STATE_LIST_SHORT } from "@/lib/licensing";

export default function HomePage() {
  return (
    <>
      <Nav />

      <main>
        {/* HERO */}
        <section className="relative">
          <div className="mx-auto max-w-4xl px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
            <div className="flex justify-center mb-12">
              <div className="relative">
                <OrbFlowField />
                <Orb size="hero" />
              </div>
            </div>

            <p className="principle-label mb-6">{copy.hero.eyebrow}</p>

            <h1 className="font-display text-5xl sm:text-7xl leading-[1.05] tracking-tight tagline">
              {copy.hero.tagline}
              <br />
              <em>{copy.hero.taglineEmphasis}</em>
            </h1>

            <p className="mt-8 text-lg text-[var(--muted)] max-w-2xl mx-auto leading-relaxed">
              {copy.hero.sub}
            </p>

            <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-stretch">
              <CTAButton
                href={ANCHOR_LO.calendlyBorrower!}
                variant="primary"
                ariaLabel="Borrower intro call"
              >
                {copy.hero.borrowerCta}
              </CTAButton>
              <CTAButton
                href={ANCHOR_LO.calendlyAgent!}
                variant="secondary"
                ariaLabel="Agent partnership intro call"
              >
                {copy.hero.agentCta}
              </CTAButton>
            </div>

            <p className="mt-10 font-mono text-xs tracking-[0.2em] text-[var(--muted)]">
              LICENSED IN {STATE_LIST_SHORT}
            </p>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section
          id="principles"
          className="border-t border-[var(--rule)]"
        >
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <div className="principle-label">{copy.principles.eyebrow}</div>
              <h2 className="font-display text-4xl sm:text-5xl mt-4 leading-tight">
                {copy.principles.heading}
              </h2>
              <p className="mt-4 text-[var(--muted)] leading-relaxed">
                {copy.principles.sub}
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {principles.map((p, i) => (
                <div
                  key={p.number}
                  className={
                    // Asymmetric: the manifesto principle gets two cells on lg
                    i === 6 ? "lg:col-span-2" : ""
                  }
                >
                  <PrincipleCard
                    number={p.number}
                    title={p.title}
                    body={p.body}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <div className="principle-label">{copy.how.eyebrow}</div>
              <h2 className="font-display text-4xl sm:text-5xl mt-4 leading-tight">
                {copy.how.heading}
              </h2>
            </div>

            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {copy.how.steps.map((s) => (
                <li key={s.n} className="relative">
                  <div className="font-mono text-sm text-[var(--color-m8-green)]">
                    {s.n}
                  </div>
                  <h3 className="font-display text-2xl mt-3 leading-snug">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-[var(--muted)] leading-relaxed">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FOR AGENTS */}
        <section className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-3xl">
              <div className="principle-label">{copy.agents.eyebrow}</div>
              <h2 className="font-display text-4xl sm:text-5xl mt-4 leading-tight">
                {copy.agents.heading}
              </h2>
              <p className="mt-4 text-[var(--muted)] leading-relaxed">
                {copy.agents.sub}
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {copy.agents.cards.map((c) => (
                <div
                  key={c.title}
                  className="p-7 border border-[var(--rule)] rounded-2xl"
                >
                  <h3 className="font-display text-xl leading-snug">
                    {c.title}
                  </h3>
                  <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-12">
              <CTAButton href="/agents" variant="primary">
                {copy.agents.cta}
              </CTAButton>
            </div>
          </div>
        </section>

        {/* ABOUT JASON */}
        <section id="about" className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-4xl px-6 py-24">
            <div className="principle-label">{copy.about.eyebrow}</div>
            <h2 className="font-display text-4xl sm:text-5xl mt-4 leading-tight">
              {copy.about.heading}
            </h2>
            <p className="mt-6 text-lg text-[var(--muted)] leading-relaxed max-w-2xl">
              {copy.about.sub}
            </p>
            <p className="mt-6 font-mono text-xs tracking-[0.2em] text-[var(--color-m8-green)]">
              {copy.about.nmls}
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
