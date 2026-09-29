import CTAButton from "@/components/CTAButton";
import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";

/**
 * MloBand — one short forest chapter for licensed MLOs, linking to
 * /join. Reveal with the accent phrase underlined. No earnings claims.
 */
export default function MloBand() {
  return (
    <section id="mlos" className="scene scene--forest">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="hm-mlo">
          <div>
            <div className="code-label">{copy.mloBand.eyebrow}</div>
            <Reveal as="h2" text={copy.mloBand.heading} accent={copy.mloBand.accent} underline className="hm-h2 mt-4" />
            <p className="sr-only">{homeContent.mlo.textEquivalent}</p>
            <p className="hm-sub max-w-xl">{copy.mloBand.body}</p>
          </div>
          <div className="md:justify-self-end w-full max-w-sm">
            <CTAButton href="/join" variant="secondary" icon="//">
              {copy.mloBand.cta}
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  );
}
