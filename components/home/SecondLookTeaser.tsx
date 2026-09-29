import CTAButton from "@/components/CTAButton";
import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";
import SecondLookScene from "./SecondLookScene";

/**
 * SecondLookTeaser — a compact loop of the decode animation with a CTA
 * to /second-look. Server wrapper: heading + body + CTA here, motion
 * in SecondLookScene.
 */
export default function SecondLookTeaser() {
  const t = homeContent.secondLook;
  return (
    <section id="second-look" className="hm-rule hm-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="code-label">{copy.secondLookTeaser.eyebrow}</div>
          <Reveal as="h2" text={copy.secondLookTeaser.heading} accent={copy.secondLookTeaser.accent} className="hm-h2 mt-4" />
          <p className="hm-sub">{copy.secondLookTeaser.body}</p>
        </div>

        <div className="mt-10">
          <SecondLookScene
            sceneLabel={copy.secondLookTeaser.eyebrow}
            counter={t.counter}
            docTitle={t.docTitle}
            docMeta={t.docMeta}
            sections={t.docSections}
            fields={t.docFields}
            resultLabel={t.resultLabel}
            resultLines={t.resultLines}
            textEquivalent={t.textEquivalent}
          />
        </div>

        <div className="mt-8 max-w-sm">
          <CTAButton href="/second-look" variant="secondary" icon="LE">
            {copy.secondLookTeaser.cta}
          </CTAButton>
        </div>
      </div>
    </section>
  );
}
