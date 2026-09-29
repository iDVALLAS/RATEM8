import CTAButton from "@/components/CTAButton";
import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";

/**
 * AgentsBand — "Your buyers stall when financing is murky. M8 unsticks
 * them." Three cards, CTA to /agents. Server component.
 */
export default function AgentsBand() {
  return (
    <section id="agents" className="hm-rule hm-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <div className="eyebrow">{copy.agents.eyebrow}</div>
          <Reveal as="h2" text={copy.agents.heading} accent="unsticks" className="hm-h2 mt-4" />
          <p className="hm-sub max-w-2xl">{copy.agents.sub}</p>
        </div>

        <ul className="hm-agents__grid list-none p-0 m-0">
          {copy.agents.cards.map((c) => (
            <li key={c.title} className="hm-agents__card">
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 max-w-sm">
          <CTAButton href="/agents" variant="secondary">
            {copy.agents.cta}
          </CTAButton>
        </div>
      </div>
    </section>
  );
}
