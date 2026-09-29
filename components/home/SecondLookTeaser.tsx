import CTAButton from "@/components/CTAButton";
import { Sheet } from "@/components/motion/Stage";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";
import SecondLookScene from "./SecondLookScene";

/**
 * SecondLookTeaser — a compact loop of the decode animation with a CTA
 * to /second-look, as a night sheet on the stage. Server wrapper:
 * heading + body + CTA here, motion in SecondLookScene (which stays a
 * paper Scene, framed as a card inside the sheet).
 */
export default function SecondLookTeaser() {
  const t = homeContent.secondLook;
  return (
    <Sheet id="second-look" chapter="night" className="hm-sheet">
      <div className="hm-sheet__inner sheet-fill mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="code-label">{copy.secondLookTeaser.eyebrow}</div>
          <SlideHeadline as="h2" lines={splitLines(copy.secondLookTeaser.heading)} accent={copy.secondLookTeaser.accent} dim className="hm-h2 mt-4" />
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
    </Sheet>
  );
}
