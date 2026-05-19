import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import VoiceOrb from "@/components/VoiceOrb";
import TermField from "@/components/TermField";
import CTAButton from "@/components/CTAButton";
import PrincipleCard from "@/components/PrincipleCard";
import { copy } from "@/lib/copy";
import { principles } from "@/lib/principles";
import { ANCHOR_LO } from "@/lib/licensing";

export default function HomePage() {
  return (
    <>
      <Nav />

      <main>
        {/* ───── HERO ───── */}
        <section className="relative min-h-[88vh] overflow-hidden">
          <TermField />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-m8-green)]/8 blur-[120px]"
          />

          <div className="relative z-10 mx-auto max-w-4xl px-6 pt-20 pb-20 sm:pt-28 sm:pb-28 text-center">
            <div className="mb-12">
              <VoiceOrb />
            </div>

            {/* v7: Tagline is now a single Fraunces serif line.
                "Free for all loan mates." italic line removed
                per design direction. The phrase still appears
                in the footer signature and metadata. */}
            <h1 className="tagline text-5xl sm:text-7xl">
              {copy.hero.tagline}
            </h1>

            <p className="mt-10 text-lg text-[var(--muted)] max-w-2xl mx-auto leading-relaxed font-light">
              {copy.hero.sub}
            </p>

            <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-stretch">
              {/* v7: Borrower CTA now routes to /chat (M8 demo)
                  instead of Calendly. The demo gives borrowers
                  a real preview of the M8 experience before
                  asking them to book a call. */}
              <CTAButton
                href="/chat"
                variant="primary"
                ariaLabel="Shop a mortgage with M8"
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
          </div>
        </section>

        {/* ───── PRINCIPLES ───── */}
        <section id="principles" className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <div className="principle-label">{copy.principles.eyebrow}</div>
              <h2 className="font-display font-bold text-4xl sm:text-5xl mt-4 leading-tight tracking-tight">
                {copy.principles.heading}
              </h2>
              <p className="mt-4 text-[var(--muted)] leading-relaxed font-light">
                {copy.principles.sub}
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {principles.map((p, i) => (
                <div
                  key={p.number}
                  className={i === 6 ? "lg:col-span-2" : ""}
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

        {/* ───── HOW IT WORKS ───── */}
        <section className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <div className="principle-label">{copy.how.eyebrow}</div>
              <h2 className="font-display font-bold text-4xl sm:text-5xl mt-4 leading-tight tracking-tight">
                {copy.how.heading}
              </h2>
            </div>

            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {copy.how.steps.map((s) => (
                <li key={s.n} className="relative">
                  <div className="font-mono text-sm text-[var(--color-m8-green)]">
                    {s.n}
                  </div>
                  <h3 className="font-display font-semibold text-2xl mt-3 leading-snug">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-[var(--muted)] leading-relaxed font-light">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───── FOR AGENTS ───── */}
        <section className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-3xl">
              <div className="principle-label">{copy.agents.eyebrow}</div>
              <h2 className="font-display font-bold text-4xl sm:text-5xl mt-4 leading-tight tracking-tight">
                {copy.agents.heading}
              </h2>
              <p className="mt-4 text-[var(--muted)] leading-relaxed font-light">
                {copy.agents.sub}
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {copy.agents.cards.map((c) => (
                <div
                  key={c.title}
                  className="p-7 border border-[var(--rule)] rounded-2xl"
                >
                  <h3 className="font-display font-semibold text-xl leading-snug">
                    {c.title}
                  </h3>
                  <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed font-light">
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

        {/* ───── ABOUT JASON ───── */}
        <section id="about" className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-4xl px-6 py-24">
            <div className="principle-label">{copy.about.eyebrow}</div>
            <h2 className="font-display font-bold text-4xl sm:text-5xl mt-4 leading-tight tracking-tight">
              {copy.about.heading}
            </h2>
            <p className="mt-6 text-lg text-[var(--muted)] leading-relaxed max-w-2xl font-light">
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
