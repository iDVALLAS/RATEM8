import CTAButton from "@/components/CTAButton";
import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";
import { principles } from "@/lib/principles";
import { homeContent } from "@/lib/content/home";
import PrinciplesScene from "./PrinciplesScene";

/**
 * Principles — the eight, op-ed feel. Heading reveals word by word;
 * the cards step in inside a Scene. Links to /principles for the full
 * manifesto.
 */
export default function Principles() {
  return (
    <section id="principles" className="hm-rule hm-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="eyebrow">{copy.principles.eyebrow}</div>
          <Reveal as="h2" text={copy.principles.heading} accent="owe you." underline className="hm-h2 mt-4" />
          <p className="hm-sub">{copy.principles.sub}</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl mt-4">
        <PrinciplesScene
          principles={principles}
          listLabel={homeContent.principles.listLabel}
          label={homeContent.principles.sceneLabel}
          counterTotal={String(principles.length).padStart(2, "0")}
          textEquivalent={homeContent.principles.textEquivalent}
        />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 mt-8">
        <div className="max-w-sm">
          <CTAButton href="/principles" variant="outline" icon="//" sub={homeContent.principles.ctaCardBody}>
            {copy.principles.readAll}
          </CTAButton>
        </div>
      </div>
    </section>
  );
}
