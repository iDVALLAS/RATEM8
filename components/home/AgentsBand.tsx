import CTAButton from "@/components/CTAButton";
import { Sheet } from "@/components/motion/Stage";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import { copy } from "@/lib/copy";
import { MloText } from "@/components/mlo/MloContext";

/**
 * AgentsBand — "Your buyers stall when financing is murky. M8 unsticks
 * them." A forest sheet: slide headline, three float cards, CTA to
 * /agents. Server component.
 */
export default function AgentsBand() {
  return (
    <Sheet id="agents" chapter="forest" className="hm-sheet">
      <div className="hm-sheet__inner sheet-fill mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <div className="eyebrow">{copy.agents.eyebrow}</div>
          <SlideHeadline as="h2" lines={splitLines(copy.agents.heading)} accent="unsticks" dim className="hm-h2 mt-4" />
          <p className="hm-sub max-w-2xl">{copy.agents.sub}</p>
        </div>

        <ul className="hm-agents__grid list-none p-0 m-0">
          {copy.agents.cards.map((c) => (
            <li key={c.title} className="hm-agents__card float-card">
              <h3>{c.title}</h3>
              <p>{"bodyNamed" in c ? <MloText generic={c.body} named={c.bodyNamed} /> : c.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 max-w-sm">
          <CTAButton href="/agents" variant="secondary">
            {copy.agents.cta}
          </CTAButton>
        </div>
      </div>
    </Sheet>
  );
}
