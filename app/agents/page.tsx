import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CTAButton from "@/components/CTAButton";
import Orb from "@/components/Orb";
import { copy } from "@/lib/copy";

const agentCalendly =
  process.env.NEXT_PUBLIC_CALENDLY_AGENT ||
  "https://calendly.com/chris-ratem8/agent-partnership";

export const metadata = {
  title: "For Agents — RateM8",
  description:
    "A mortgage partner who answers his own phone and doesn't poach your client list.",
};

export default function AgentsPage() {
  return (
    <>
      <Nav />

      <main>
        <section className="border-b border-[var(--rule)]">
          <div className="mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">
            <div className="flex justify-center mb-10">
              <Orb size="hero" />
            </div>
            <div className="principle-label">{copy.agentsPage.eyebrow}</div>
            <h1 className="font-display text-5xl sm:text-6xl mt-4 leading-[1.05] tracking-tight">
              {copy.agentsPage.heading}
            </h1>
            <p className="mt-6 text-lg text-[var(--muted)] max-w-2xl mx-auto leading-relaxed">
              {copy.agentsPage.sub}
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-4xl px-6 py-20 space-y-14">
            {copy.agentsPage.sections.map((s) => (
              <div key={s.title} className="grid md:grid-cols-3 gap-6">
                <h2 className="font-display text-2xl leading-snug md:col-span-1">
                  {s.title}
                </h2>
                <p className="md:col-span-2 text-[var(--muted)] leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--rule)]">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center">
            <h2 className="font-display text-3xl sm:text-4xl leading-tight">
              Ready to talk?
            </h2>
            <p className="mt-4 text-[var(--muted)]">
              Twenty minutes. No pitch deck. Just questions and answers.
            </p>
            <div className="mt-8 inline-flex">
              <CTAButton href={agentCalendly} variant="primary">
                {copy.agentsPage.cta}
              </CTAButton>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
